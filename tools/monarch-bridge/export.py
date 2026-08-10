"""Monarch -> Long-Term-Finance-Planner bridge.

Logs into Monarch Money (via the unofficial `monarchmoney` GraphQL client),
pulls accounts, categories, and transactions for a date range, and writes a
normalized, cents-based JSON envelope that later phases of the planner consume
(post-period audit auto-fill, income/expense distributions, starting balances).

This is a SOURCE export, not a planner document. It is intentionally decoupled
from the app's PlanDocument schema so the mapping logic can live in the app.

Usage (from tools/monarch-bridge/, venv activated):
    python export.py                       # last 12 months -> monarch-export.json
    python export.py --months 24
    python export.py --start 2026-01-01 --end 2026-08-01
    python export.py --out ../../monarch-export.json

Credentials come from environment / .env (see .env.example). Session is cached
so MFA is only needed occasionally; set MONARCH_MFA_SECRET for fully
non-interactive runs (required for the scheduled Claude report later).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from calendar import monthrange
from datetime import date, datetime, timezone

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency hint
    print("Missing dependency. Run: pip install -r requirements.txt", file=sys.stderr)
    raise

try:
    from monarchmoney import (
        LoginFailedException,
        MonarchMoney,
        MonarchMoneyEndpoints,
        RequireMFAException,
    )
except ImportError:  # pragma: no cover - dependency hint
    print("Missing dependency. Run: pip install -r requirements.txt", file=sys.stderr)
    raise

SCHEMA_VERSION = 2

# Monarch moved its API to api.monarch.com on 2026-02-01, but monarchmoney
# 0.1.15 (the newest on PyPI) still hardcodes the retired api.monarchmoney.com.
# The upstream fix is a one-line BASE_URL change that has sat unmerged since
# (hammem/monarchmoney#184, PRs #188/#192), so we override it here rather than
# pin a fork. Override via MONARCH_API_BASE when Monarch moves again or upstream
# finally ships; drop this block once the library is correct on its own.
DEFAULT_API_BASE = "https://api.monarch.com"
SESSION_FILE = os.path.join(os.path.dirname(__file__), ".mm_session.pickle")
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "monarch-export.json")

# How we bucket Monarch accounts into the planner's two liquid balances.
# Everything else (investments, loans, real estate) is exported raw but not
# summed into the suggested balances, since it isn't spendable cash.
SPENDABLE_SUBTYPES = {"checking", "money_market", "cash"}
SAVINGS_SUBTYPES = {"savings"}


def cents(amount: float | int | None) -> int:
    """Convert a Monarch dollar float to integer cents, preserving sign."""
    if amount is None:
        return 0
    return round(float(amount) * 100)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Monarch data for the planner.")
    parser.add_argument("--months", type=int, default=12, help="Look-back window in months (default 12).")
    parser.add_argument("--start", type=str, help="Start date YYYY-MM-DD (overrides --months).")
    parser.add_argument("--end", type=str, help="End date YYYY-MM-DD (default today).")
    parser.add_argument("--out", type=str, default=DEFAULT_OUT, help="Output JSON path.")
    return parser.parse_args()


def resolve_range(args: argparse.Namespace) -> tuple[str, str]:
    end = date.fromisoformat(args.end) if args.end else date.today()
    if args.start:
        start = date.fromisoformat(args.start)
    else:
        start = months_before(end, args.months)
    if start > end:
        raise SystemExit("Start date is after end date.")
    return start.isoformat(), end.isoformat()


def months_before(anchor: date, months: int) -> date:
    """Calendar-accurate look-back, clamping to the last valid day of the month."""
    total = anchor.year * 12 + (anchor.month - 1) - months
    year, month = divmod(total, 12)
    month += 1
    # e.g. 1 month before Mar 31 -> Feb 28/29, not an invalid date.
    last_day = monthrange(year, month)[1]
    return date(year, month, min(anchor.day, last_day))


def apply_api_base() -> str:
    """Point the client at the current Monarch API host. See DEFAULT_API_BASE."""
    base = (os.environ.get("MONARCH_API_BASE") or DEFAULT_API_BASE).rstrip("/")
    MonarchMoneyEndpoints.BASE_URL = base
    return base


async def authenticate() -> MonarchMoney:
    """Log in, reusing a cached session when possible."""
    base = apply_api_base()
    print(f"Monarch API base: {base}", file=sys.stderr)
    mm = MonarchMoney(session_file=SESSION_FILE)

    if os.path.exists(SESSION_FILE):
        try:
            mm.load_session(SESSION_FILE)
            # Cheap call to confirm the session is still valid.
            await mm.get_accounts()
            print("Reusing cached session.", file=sys.stderr)
            return mm
        except Exception:
            print("Cached session expired; logging in fresh.", file=sys.stderr)
            # The stale pickle must go before we re-login: MonarchMoney.login()
            # short-circuits to the saved session whenever the file exists, so
            # leaving it in place would silently reload the dead session.
            os.remove(SESSION_FILE)

    email = os.environ.get("MONARCH_EMAIL")
    password = os.environ.get("MONARCH_PASSWORD")
    mfa_secret = os.environ.get("MONARCH_MFA_SECRET") or None
    if not email or not password:
        raise SystemExit("Set MONARCH_EMAIL and MONARCH_PASSWORD (see .env.example).")

    try:
        await mm.login(
            email=email,
            password=password,
            use_saved_session=False,
            save_session=True,
            mfa_secret_key=mfa_secret,
        )
    except RequireMFAException:
        if mfa_secret:
            raise SystemExit(
                "Monarch rejected the generated MFA code. Check that "
                "MONARCH_MFA_SECRET is the base32 TOTP secret (not a 6-digit code) "
                "and that this machine's clock is accurate."
            )
        # isatty() is unreliable here (it reports true under some Windows
        # shells even with no readable stdin), so let the read fail and
        # translate it rather than trying to predict interactivity.
        try:
            code = input("Monarch MFA code: ").strip()
        except (EOFError, KeyboardInterrupt):
            raise SystemExit(
                "\nMonarch requires MFA but no code could be read (non-interactive run).\n"
                "Set MONARCH_MFA_SECRET in .env to the base32 TOTP secret from\n"
                "Monarch -> Settings -> Security. See .env.example."
            )
        try:
            await mm.multi_factor_authenticate(email, password, code)
        except Exception as exc:
            raise SystemExit(f"MFA failed: {exc}")
        mm.save_session(SESSION_FILE)
    except LoginFailedException as exc:
        raise SystemExit(login_failure_hint(exc))

    return mm


def login_failure_hint(exc: LoginFailedException) -> str:
    """Turn the library's bare HTTP error into something actionable."""
    message = str(exc)
    if "429" in message:
        return (
            f"Monarch rate-limited the login ({message}).\n"
            "This is throttling, not a bad password -- the credentials were never checked.\n"
            "Wait ~15-30 minutes before retrying; repeated attempts extend the block.\n"
            "A successful run caches a session, so this is mostly a first-login problem."
        )
    if "403" in message:
        return (
            f"Monarch rejected the login ({message}).\n"
            "If the account has MFA, set MONARCH_MFA_SECRET in .env for non-interactive runs."
        )
    if "401" in message or "400" in message:
        return (
            f"Monarch rejected the credentials ({message}).\n"
            "Check MONARCH_EMAIL and MONARCH_PASSWORD in .env."
        )
    return f"Monarch login failed: {message}"


def normalize_accounts(raw: dict) -> tuple[list[dict], dict]:
    accounts: list[dict] = []
    spendable = 0
    savings = 0
    for acct in raw.get("accounts", []):
        subtype = ((acct.get("subtype") or {}).get("name") or "").lower()
        type_name = ((acct.get("type") or {}).get("name") or "").lower()
        balance_cents = cents(acct.get("currentBalance"))
        is_asset = bool(acct.get("isAsset", True))
        is_hidden = bool(acct.get("isHidden", False))
        is_closed = acct.get("deactivatedAt") is not None
        accounts.append(
            {
                "id": acct.get("id"),
                "name": acct.get("displayName"),
                "type": type_name,
                "subtype": subtype,
                "isAsset": is_asset,
                "isHidden": is_hidden,
                "isClosed": is_closed,
                "currentBalanceCents": balance_cents,
            }
        )
        # Closed and hidden accounts still ship in `accounts` (the app may want
        # them for history), but they are not spendable cash today, so keeping
        # them out of the suggestion is what makes it tie out to the Monarch UI.
        if not is_asset or is_hidden or is_closed:
            continue
        if subtype in SPENDABLE_SUBTYPES:
            spendable += balance_cents
        elif subtype in SAVINGS_SUBTYPES:
            savings += balance_cents

    balances = {"spendableCents": spendable, "savingsCents": savings}
    return accounts, balances


def normalize_categories(raw: dict) -> tuple[list[dict], dict]:
    categories: list[dict] = []
    group_type_by_category: dict[str, str] = {}
    for cat in raw.get("categories", []):
        group = cat.get("group") or {}
        group_type = (group.get("type") or "").lower()  # income | expense | transfer
        categories.append(
            {
                "id": cat.get("id"),
                "name": cat.get("name"),
                "group": group.get("name"),
                "groupType": group_type,
            }
        )
        if cat.get("id"):
            group_type_by_category[cat["id"]] = group_type
    return categories, group_type_by_category


async def fetch_all_transactions(mm: MonarchMoney, start: str, end: str) -> list[dict]:
    """Page through transactions in the date range.

    Paging is driven by `totalCount` rather than by a short page, because the
    server is free to return fewer rows than the requested limit. We also key on
    transaction id so a server that ignores `offset` surfaces as an error
    instead of an infinite loop.
    """
    page_size = 200
    offset = 0
    total: int | None = None
    results: list[dict] = []
    seen: set[str] = set()

    while True:
        batch = await mm.get_transactions(
            limit=page_size,
            offset=offset,
            start_date=start,
            end_date=end,
        )
        all_txns = batch.get("allTransactions") or {}
        if total is None:
            total = all_txns.get("totalCount")
        page = all_txns.get("results") or []
        if not page:
            break

        new = [t for t in page if t.get("id") not in seen]
        if not new:
            raise SystemExit(
                f"Pagination stalled at offset {offset}: page returned only "
                "transactions already seen. The API may be ignoring `offset`."
            )
        seen.update(t.get("id") for t in new)
        results.extend(new)

        offset += len(page)
        if total is not None and len(results) >= total:
            break

    if total is not None and len(results) != total:
        print(
            f"WARNING: fetched {len(results)} transactions but the API reported "
            f"totalCount={total}.",
            file=sys.stderr,
        )
    return results


def normalize_transactions(raw: list[dict], group_type_by_category: dict) -> list[dict]:
    out: list[dict] = []
    for txn in raw:
        category = txn.get("category") or {}
        category_id = category.get("id")
        out.append(
            {
                "id": txn.get("id"),
                "date": txn.get("date"),
                # Monarch: negative = money out (expense), positive = money in.
                "amountCents": cents(txn.get("amount")),
                "category": category.get("name"),
                "categoryId": category_id,
                "groupType": group_type_by_category.get(category_id, ""),
                "merchant": (txn.get("merchant") or {}).get("name"),
                "account": (txn.get("account") or {}).get("displayName"),
                # Downstream (audit auto-fill) needs these to avoid double
                # counting a split against its parent and to honour the same
                # exclusions Monarch's own reports apply.
                "pending": bool(txn.get("pending", False)),
                "hiddenFromReports": bool(txn.get("hideFromReports", False)),
                "isSplit": bool(txn.get("isSplitTransaction", False)),
            }
        )
    return out


async def run() -> int:
    load_dotenv()
    args = parse_args()
    start, end = resolve_range(args)

    mm = await authenticate()

    accounts_raw = await mm.get_accounts()
    categories_raw = await mm.get_transaction_categories()
    accounts, balances = normalize_accounts(accounts_raw)
    categories, group_type_by_category = normalize_categories(categories_raw)

    txns_raw = await fetch_all_transactions(mm, start, end)
    transactions = normalize_transactions(txns_raw, group_type_by_category)

    envelope = {
        "source": "monarch",
        "schemaVersion": SCHEMA_VERSION,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "range": {"start": start, "end": end},
        "balances": balances,
        "accounts": accounts,
        "categories": categories,
        "transactions": transactions,
    }

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(envelope, handle, indent=2)

    print(
        f"Wrote {len(transactions)} transactions across {len(accounts)} accounts "
        f"({start} -> {end}) to {args.out}"
    )
    print(
        f"Suggested balances: spendable {balances['spendableCents'] / 100:.2f}, "
        f"savings {balances['savingsCents'] / 100:.2f}"
    )
    print_spot_check(transactions)
    return 0


def print_spot_check(transactions: list[dict]) -> None:
    """Print the figures worth eyeballing against the Monarch UI."""
    if not transactions:
        print("\nNo transactions in range -- nothing to spot-check.")
        return

    totals: dict[str, int] = {}
    for txn in transactions:
        key = txn["groupType"] or "(uncategorized)"
        totals[key] = totals.get(key, 0) + txn["amountCents"]

    dates = sorted(t["date"] for t in transactions if t.get("date"))
    print("\n--- Spot check (compare against the Monarch UI) ---")
    print(f"Date span actually returned: {dates[0]} -> {dates[-1]}")
    print("Signed totals by groupType (negative = money out):")
    for key in sorted(totals):
        count = sum(1 for t in transactions if (t["groupType"] or "(uncategorized)") == key)
        print(f"  {key:<16} {totals[key] / 100:>14,.2f}  ({count} txns)")

    flagged = {
        "pending": sum(1 for t in transactions if t["pending"]),
        "hiddenFromReports": sum(1 for t in transactions if t["hiddenFromReports"]),
        "isSplit": sum(1 for t in transactions if t["isSplit"]),
        "uncategorized": sum(1 for t in transactions if not t["groupType"]),
    }
    print("Flags to be aware of downstream: " + ", ".join(f"{k}={v}" for k, v in flagged.items()))

    print("Largest 3 inflows / outflows (verify cents + sign):")
    ordered = sorted(transactions, key=lambda t: t["amountCents"])
    for txn in ordered[:3] + ordered[-3:][::-1]:
        print(
            f"  {txn['date']}  {txn['amountCents'] / 100:>12,.2f}  "
            f"{(txn['merchant'] or '?')[:28]:<28} [{txn['groupType'] or '-'}]"
        )


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
