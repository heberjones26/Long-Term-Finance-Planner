import { describe, expect, it } from "vitest";
import { isPeriodCurrent, isPeriodPast } from "./periods";
import type { FinancialPeriod } from "./types";

const period: FinancialPeriod = {
  id: "period",
  name: "Summer",
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  costOfLivingScenarioId: "col",
  grossIncomeItems: [],
  extraExpenseItems: [],
  effectiveTaxRate: 0,
  savingsRate: 0,
  charityRate: 0
};

describe("period helpers", () => {
  it("identifies the current period from local dates", () => {
    expect(isPeriodCurrent(period, "2026-05-31")).toBe(false);
    expect(isPeriodCurrent(period, "2026-06-01")).toBe(true);
    expect(isPeriodCurrent(period, "2026-06-30")).toBe(true);
    expect(isPeriodCurrent(period, "2026-07-01")).toBe(false);
  });

  it("identifies periods that are ready for post-period audit", () => {
    expect(isPeriodPast(period, "2026-06-30")).toBe(false);
    expect(isPeriodPast(period, "2026-07-01")).toBe(true);
  });
});
