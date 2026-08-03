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
from datetime import date, datetime, timedelta, timezone

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency hint
    print("Missing dependency. Run: pip install -r requirements.txt", file=sys.stderr)
    raise

try:
    from monarchmoney import MonarchMoney, RequireMFAException
except ImportError:  # pragma: no cover - dependency hint
    print("Missing dependency. Run: pip install -r requirements.txt", file=sys.stderr)
    raise

SCHEMA_VERSION = 1
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
        # Approximate month look-back; good enough for a data pull.
        start = end - timedelta(days=30 * args.months)
    if start > end:
        raise SystemExit("Start date is after end date.")
    return start.isoformat(), end.isoformat()


async def authenticate() -> MonarchMoney:
    """Log in, reusing a cached session when possible."""
    mm = MonarchMoney(session_file=SESSION_FILE)

    if os.path.exists(SESSION_FILE):
        try:
            mm.load_session(SESSION_FILE)
            # Cheap call to confirm the session is still valid.
            await mm.get_accounts()
            return mm
        except Exception:
            print("Cached session expired; logging in fresh.", file=sys.stderr)

    email = os.environ.get("MONARCH_EMAIL")
    password = os.environ.get("MONARCH_PASSWORD")
    mfa_secret = os.environ.get("MONARCH_MFA_SECRET") or None
    if not email or not password:
        raise SystemExit("Set MONARCH_EMAIL and MONARCH_PASSWORD (see .env.example).")

    try:
        await mm.login(
            email=email,
            password=password,
            save_session=True,
            mfa_secret_key=mfa_secret,
        )
    except RequireMFAException:
        code = input("Monarch MFA code: ").strip()
        await mm.multi_factor_authenticate(email, password, code)
        mm.save_session(SESSION_FILE)

    return mm


def normalize_accounts(raw: dict) -> tuple[list[dict], dict]:
    accounts: list[dict] = []
    spendable = 0
    savings = 0
    for acct in raw.get("accounts", []):
        subtype = ((acct.get("subtype") or {}).get("name") or "").lower()
        type_name = ((acct.get("type") or {}).get("name") or "").lower()
        balance_cents = cents(acct.get("currentBalance"))
        is_asset = bool(acct.get("isAsset", True))
        accounts.append(
            {
                "id": acct.get("id"),
                "name": acct.get("displayName"),
                "type": type_name,
                "subtype": subtype,
                "isAsset": is_asset,
                "currentBalanceCents": balance_cents,
            }
        )
        if not is_asset:
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
    """Page through transactions in the date range."""
    page_size = 200
    offset = 0
    results: list[dict] = []
    while True:
        batch = await mm.get_transactions(
            limit=page_size,
            offset=offset,
            start_date=start,
            end_date=end,
        )
        page = (batch.get("allTransactions") or {}).get("results") or []
        results.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
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
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
