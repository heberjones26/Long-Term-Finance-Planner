"""Offline checks for export.py's normalization, using API-shaped fixtures.

These cover the parts of the bridge that are easy to get wrong and expensive to
discover against a live account: cents/sign conversion, groupType mapping, which
accounts feed the suggested balances, and pagination past a single page.

No credentials and no network. Run it after touching export.py:

    .\\.venv\\Scripts\\python.exe test_export.py

Exits non-zero on the first set of failures. Deliberately dependency-free (no
pytest) so it runs with nothing but requirements.txt installed.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date

import export as E

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")
    else:
        print(f"  ok  {label}")


def test_cents() -> None:
    print("== cents conversion / sign ==")
    check("dollars -> cents", E.cents(12.34), 1234)
    check("expense keeps its negative sign", E.cents(-45.67), -4567)
    check("None -> 0", E.cents(None), 0)
    check("float error does not leak (0.1+0.2)", E.cents(0.1 + 0.2), 30)
    check("common price", E.cents(19.99), 1999)


def test_lookback() -> None:
    print("\n== calendar look-back ==")
    check("12 months", E.months_before(date(2026, 8, 3), 12).isoformat(), "2025-08-03")
    check("clamps short month", E.months_before(date(2026, 3, 31), 1).isoformat(), "2026-02-28")
    check("crosses year boundary", E.months_before(date(2026, 2, 15), 14).isoformat(), "2024-12-15")


def test_accounts() -> None:
    print("\n== accounts -> suggested balances ==")
    raw = {"accounts": [
        {"id": "1", "displayName": "Everyday Checking", "currentBalance": 1500.25, "isAsset": True,
         "isHidden": False, "deactivatedAt": None, "type": {"name": "depository"}, "subtype": {"name": "checking"}},
        {"id": "2", "displayName": "High Yield Savings", "currentBalance": 8000.00, "isAsset": True,
         "isHidden": False, "deactivatedAt": None, "type": {"name": "depository"}, "subtype": {"name": "savings"}},
        {"id": "3", "displayName": "Closed Checking", "currentBalance": 999.99, "isAsset": True,
         "isHidden": False, "deactivatedAt": "2025-01-04T00:00:00+00:00",
         "type": {"name": "depository"}, "subtype": {"name": "checking"}},
        {"id": "4", "displayName": "Hidden Cash", "currentBalance": 250.00, "isAsset": True,
         "isHidden": True, "deactivatedAt": None, "type": {"name": "depository"}, "subtype": {"name": "cash"}},
        {"id": "5", "displayName": "Credit Card", "currentBalance": -430.10, "isAsset": False,
         "isHidden": False, "deactivatedAt": None, "type": {"name": "credit"}, "subtype": {"name": "credit_card"}},
        {"id": "6", "displayName": "Brokerage", "currentBalance": 24000.00, "isAsset": True,
         "isHidden": False, "deactivatedAt": None, "type": {"name": "brokerage"}, "subtype": {"name": "brokerage"}},
        {"id": "7", "displayName": "No type at all", "currentBalance": 10.00, "isAsset": True,
         "isHidden": False, "deactivatedAt": None, "type": None, "subtype": None},
    ]}
    accounts, balances = E.normalize_accounts(raw)

    check("every account is still exported", len(accounts), 7)
    check("closed account excluded from spendable", balances["spendableCents"], 150025)
    check("savings summed", balances["savingsCents"], 800000)
    check("hidden account excluded", all(
        a["isHidden"] is False for a in accounts if a["id"] != "4"), True)
    check("closed account flagged", [a["isClosed"] for a in accounts if a["id"] == "3"], [True])
    check("investments not counted as cash", balances["spendableCents"] < 2400000, True)
    check("liability balance exported raw",
          [a["currentBalanceCents"] for a in accounts if a["id"] == "5"], [-43010])
    check("null type/subtype tolerated", [a["subtype"] for a in accounts if a["id"] == "7"], [""])


def test_categories_and_transactions() -> None:
    print("\n== categories + transactions ==")
    cats_raw = {"categories": [
        {"id": "c1", "name": "Paycheck", "group": {"id": "g1", "name": "Income", "type": "income"}},
        {"id": "c2", "name": "Groceries", "group": {"id": "g2", "name": "Food", "type": "expense"}},
        {"id": "c3", "name": "CC Payment", "group": {"id": "g3", "name": "Transfer", "type": "transfer"}},
        {"id": "c4", "name": "Orphan", "group": None},
    ]}
    categories, by_id = E.normalize_categories(cats_raw)
    check("categories exported", len(categories), 4)
    check("income mapped", by_id["c1"], "income")
    check("transfer mapped", by_id["c3"], "transfer")
    check("group-less category -> empty", by_id["c4"], "")

    txns_raw = [
        {"id": "t1", "date": "2026-07-15", "amount": 2400.00, "category": {"id": "c1", "name": "Paycheck"},
         "merchant": {"name": "Employer"}, "account": {"displayName": "Checking"},
         "pending": False, "hideFromReports": False, "isSplitTransaction": False},
        {"id": "t2", "date": "2026-07-16", "amount": -82.31, "category": {"id": "c2", "name": "Groceries"},
         "merchant": {"name": "Grocer"}, "account": {"displayName": "Credit Card"},
         "pending": True, "hideFromReports": False, "isSplitTransaction": True},
        {"id": "t3", "date": "2026-07-17", "amount": -500.00, "category": {"id": "c3", "name": "CC Payment"},
         "merchant": None, "account": {"displayName": "Checking"},
         "pending": False, "hideFromReports": True, "isSplitTransaction": False},
        {"id": "t4", "date": "2026-07-18", "amount": -12.00, "category": None,
         "merchant": {"name": "Unknown"}, "account": None},
    ]
    txns = E.normalize_transactions(txns_raw, by_id)
    check("income stays positive", txns[0]["amountCents"], 240000)
    check("expense stays negative", txns[1]["amountCents"], -8231)
    check("groupType carried onto txn", txns[0]["groupType"], "income")
    check("uncategorized txn -> empty groupType", txns[3]["groupType"], "")
    check("split flagged for downstream", txns[1]["isSplit"], True)
    check("pending flagged", txns[1]["pending"], True)
    check("hidden-from-reports flagged", txns[2]["hiddenFromReports"], True)
    check("null merchant tolerated", txns[2]["merchant"], None)
    check("null account tolerated", txns[3]["account"], None)
    check("absent flag keys default to False", txns[3]["pending"], False)


class FakePagedApi:
    """Stands in for MonarchMoney.get_transactions with a known total."""

    def __init__(self, total: int, cap: int | None = None, ignore_offset: bool = False):
        self.total = total
        self.cap = cap
        self.ignore_offset = ignore_offset
        self.calls: list[tuple[int, int]] = []

    async def get_transactions(self, limit, offset, start_date, end_date):
        self.calls.append((limit, offset))
        size = min(limit, self.cap or limit)
        start = 0 if self.ignore_offset else offset
        rows = [{"id": f"t{i}"} for i in range(start, min(start + size, self.total))]
        return {"allTransactions": {"totalCount": self.total, "results": rows}}


def test_pagination() -> None:
    print("\n== pagination ==")
    api = FakePagedApi(450)
    got = asyncio.run(E.fetch_all_transactions(api, "2026-01-01", "2026-08-01"))
    check("pages past the 200 limit", len(got), 450)
    check("no duplicates across pages", len({t["id"] for t in got}), 450)

    capped = FakePagedApi(450, cap=75)  # server returns fewer rows than we asked for
    check("completes when server caps page size",
          len(asyncio.run(E.fetch_all_transactions(capped, "a", "b"))), 450)

    single = FakePagedApi(50)
    check("single short page", len(asyncio.run(E.fetch_all_transactions(single, "a", "b"))), 50)
    check("stops after one call", len(single.calls), 1)

    check("empty range", len(asyncio.run(E.fetch_all_transactions(FakePagedApi(0), "a", "b"))), 0)

    try:
        asyncio.run(E.fetch_all_transactions(FakePagedApi(450, ignore_offset=True), "a", "b"))
        failures.append("server ignoring offset should abort, but returned normally")
    except SystemExit:
        print("  ok  aborts instead of looping when offset is ignored")


def main() -> int:
    test_cents()
    test_lookback()
    test_accounts()
    test_categories_and_transactions()
    test_pagination()

    print("\n" + "=" * 58)
    if failures:
        print(f"FAILED ({len(failures)}):")
        for failure in failures:
            print("  " + failure)
        return 1
    print("All offline checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
