# Monarch bridge

Pulls your real Monarch Money data into a normalized, cents-based JSON file that
the Long-Term Finance Planner consumes. This is the data foundation for the
Monarch integration (post-period audit auto-fill, income/expense distributions,
starting balances, and the scheduled Claude report).

It is a **standalone local tool**. It does not touch the app's build, and your
credentials and exported data never leave your machine.

## Why Python

Monarch has no official public API. The reliable community client is the Python
[`monarchmoney`](https://github.com/hammem/monarchmoney) library (GraphQL, with
MFA + session caching). This tool wraps it.

## Setup (Windows PowerShell)

```powershell
cd "tools/monarch-bridge"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# then edit .env with your Monarch email/password
```

## Run

```powershell
python export.py                    # last 12 months -> monarch-export.json
python export.py --months 24        # longer look-back
python export.py --start 2026-06-06 --end 2026-08-01   # a specific period
python export.py --out ../../monarch-export.json        # write elsewhere
```

First run prompts for an MFA code (unless `MONARCH_MFA_SECRET` is set). The
session is cached in `.mm_session.pickle`, so later runs skip login until it
expires.

## Output shape (`monarch-export.json`)

```jsonc
{
  "source": "monarch",
  "schemaVersion": 1,
  "exportedAt": "2026-08-02T...Z",
  "range": { "start": "2025-08-02", "end": "2026-08-02" },
  "balances": { "spendableCents": 512300, "savingsCents": 1840000 },
  "accounts": [
    { "id", "name", "type", "subtype", "isAsset", "currentBalanceCents" }
  ],
  "categories": [
    { "id", "name", "group", "groupType" }   // groupType: income | expense | transfer
  ],
  "transactions": [
    { "id", "date", "amountCents", "category", "categoryId", "groupType", "merchant", "account" }
  ]
}
```

Conventions:
- **All money is integer cents**, matching the app (`MoneyCents`).
- Transaction `amountCents` keeps Monarch's sign: **negative = money out**
  (expense), **positive = money in** (income).
- `groupType` on each transaction/category lets downstream code separate income
  from spending without guessing from the sign.
- `balances` is a *suggestion* (checking/cash -> spendable, savings -> savings).
  All accounts are exported raw so the mapping can be refined in the app.

## How this feeds the planner (next phases)

- **Audit auto-fill:** sum `transactions` by `groupType`/`category` over a
  period's date range to populate the post-period Audit "Actual" columns
  (gross income, cost of living, extra expenses, charity...).
- **Realistic projections:** derive per-month income/expense distributions from
  the transaction history to drive P10/P50/P90 net-worth bands.
- **Starting balances:** seed `startingSpendableCents` / `startingSavingsCents`.

## Notes / caveats

- Unofficial API: field names can change with Monarch or the library. The script
  reads defensively, but if a field comes back empty, check the installed
  `monarchmoney` version against the response shape.
- Respect Monarch's Terms of Service; this is for personal use of your own data.
