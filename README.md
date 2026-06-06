# Long-Term Finance Planner

A local-first web app for long-term personal finance planning. It is built for
manual planning scenarios rather than transaction tracking or account syncing.

## What It Does

- Create cost-of-living scenarios with monthly and yearly expenses.
- Build sequential financial periods with gross income, tax rate, savings rate,
  charity rate, extra expenses, and selected COL scenario.
- Project spendable cash, savings, taxes, expenses, and goal feasibility month by
  month with day-based proration for partial months.
- Track goals with scenario variants, including a house down-payment and monthly
  payment estimator.
- Store data locally in IndexedDB and export/import JSON backups.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run test
npm run lint
npm run build
npm run e2e
```

Playwright needs a browser binary the first time it runs:

```bash
npx playwright install chromium
```
