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
expires; when it does expire the stale pickle is discarded and a full login runs
again. Non-interactive runs without `MONARCH_MFA_SECRET` fail with a clear
message instead of hanging on the code prompt.

Each run finishes with a spot-check block — signed totals by `groupType`, counts
of pending/split/hidden transactions, and the largest inflows and outflows — for
comparing against the Monarch UI.

## Tests

The normalization logic (cents/sign, `groupType` mapping, which accounts feed
the suggested balances, pagination past one page) has offline coverage that
needs no credentials and no network:

```powershell
.\.venv\Scripts\python.exe test_export.py
```

Run it after changing `export.py`, and especially after bumping the
`monarchmoney` dependency.

## Output shape (`monarch-export.json`)

```jsonc
{
  "source": "monarch",
  "schemaVersion": 2,
  "exportedAt": "2026-08-02T...Z",
  "range": { "start": "2025-08-02", "end": "2026-08-02" },
  "balances": { "spendableCents": 512300, "savingsCents": 1840000 },
  "accounts": [
    { "id", "name", "type", "subtype", "isAsset", "isHidden", "isClosed", "currentBalanceCents" }
  ],
  "categories": [
    { "id", "name", "group", "groupType" }   // groupType: income | expense | transfer
  ],
  "transactions": [
    { "id", "date", "amountCents", "category", "categoryId", "groupType", "merchant", "account",
      "pending", "hiddenFromReports", "isSplit" }
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
  Hidden and closed accounts are **excluded from the suggestion** (so it ties
  out to the Monarch UI) but are still exported in `accounts`, flagged with
  `isHidden` / `isClosed`, so the app can refine the mapping.
- `pending`, `hiddenFromReports`, and `isSplit` are exported rather than
  filtered. Downstream code should decide what to exclude — in particular,
  **summing a split alongside its parent double counts it**.

`schemaVersion` is `2` as of the first verified run against a real account;
version 1 lacked the account/transaction flags above.

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

### The API domain override (important)

Monarch moved its API from `api.monarchmoney.com` to `api.monarch.com` on
**2026-02-01**. `monarchmoney` 0.1.15 — still the newest release on PyPI — points
at the retired host, so out of the box every login fails, confusingly, with
`HTTP Code 429: Too Many Requests` rather than anything that names the real
cause. The upstream one-line fix has been open and unmerged since
([#184](https://github.com/hammem/monarchmoney/issues/184), PRs
[#188](https://github.com/hammem/monarchmoney/pull/188) /
[#192](https://github.com/hammem/monarchmoney/pull/192)).

`export.py` therefore overrides `MonarchMoneyEndpoints.BASE_URL` at startup and
prints the host it is using on every run. To point somewhere else:

```powershell
$env:MONARCH_API_BASE = "https://api.monarch.com"
```

If logins start failing again, suspect this first — check whether the domain
moved again, and delete the `DEFAULT_API_BASE` block once upstream ships a fix.

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| `429 Too Many Requests` on every attempt | Usually the stale domain, not real throttling. Confirm the run prints `api.monarch.com`. |
| `Multi-Factor Auth Required`, then exits | Account has MFA; set `MONARCH_MFA_SECRET` for non-interactive runs. |
| MFA code rejected with the secret set | `MONARCH_MFA_SECRET` must be the base32 secret, not a 6-digit code; also check the system clock. |
