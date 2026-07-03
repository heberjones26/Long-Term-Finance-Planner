import { describe, expect, it } from "vitest";
import { projectPlan } from "./projection";
import {
  applyWhatIfInputs,
  createWhatIfComparison,
  defaultWhatIfInputs
} from "./whatIf";
import type { PlanDocument } from "./types";

function basePlan(): PlanDocument {
  return {
    id: "plan",
    name: "Test plan",
    currency: "USD",
    startingSpendableCents: 100000,
    startingSavingsCents: 200000,
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    costOfLivingScenarios: [
      {
        id: "base-col",
        name: "Base",
        items: [
          {
            id: "rent",
            name: "Rent",
            category: "Housing",
            amountCents: 100000,
            cadence: "monthly"
          }
        ]
      },
      {
        id: "lean-col",
        name: "Lean",
        items: [
          {
            id: "lean-rent",
            name: "Lean rent",
            category: "Housing",
            amountCents: 50000,
            cadence: "monthly"
          }
        ]
      }
    ],
    periods: [
      {
        id: "period-1",
        name: "Period 1",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        costOfLivingScenarioId: "base-col",
        grossIncomeItems: [
          {
            id: "job",
            name: "Job",
            category: "Work",
            amountCents: 300000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 20,
        charityRate: 0
      },
      {
        id: "period-2",
        name: "Period 2",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        costOfLivingScenarioId: "base-col",
        grossIncomeItems: [
          {
            id: "contract",
            name: "Contract",
            category: "Work",
            amountCents: 200000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [
          {
            id: "move",
            name: "Move",
            category: "Logistics",
            amountCents: 50000,
            cadence: "oneTime",
            date: "2026-02-15"
          }
        ],
        effectiveTaxRate: 0,
        savingsRate: 95,
        charityRate: 0
      }
    ],
    goals: [
      {
        id: "goal",
        name: "House",
        scenarios: [
          {
            id: "scenario",
            name: "Starter",
            type: "house",
            targetDate: "2026-02-01",
            targetAmountCents: 100000,
            house: {
              purchasePriceCents: 30000000,
              downPaymentPercent: 10,
              closingCostPercent: 3,
              interestRatePercent: 6,
              loanTermYears: 30,
              annualPropertyTaxPercent: 1,
              monthlyInsuranceCents: 10000,
              monthlyHoaCents: 0
            }
          }
        ]
      }
    ]
  };
}

describe("what-if helpers", () => {
  it("applies selected cost-of-living and period item overrides without mutating the source plan", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      costOfLivingItemOverrides: [
        {
          id: "col-override",
          costOfLivingScenarioId: "base-col",
          itemId: "rent",
          amountCents: 125000
        }
      ],
      periodItemOverrides: [
        {
          id: "income-override",
          periodId: "period-2",
          itemKind: "grossIncome",
          itemId: "contract",
          amountCents: 250000
        },
        {
          id: "expense-override",
          periodId: "period-2",
          itemKind: "extraExpense",
          itemId: "move",
          amountCents: 75000
        }
      ]
    });

    expect(plan.costOfLivingScenarios[0].items[0].amountCents).toBe(100000);
    expect(plan.periods[1].grossIncomeItems[0].amountCents).toBe(200000);
    expect(plan.periods[1].extraExpenseItems[0].amountCents).toBe(50000);
    expect(result.costOfLivingScenarios[0].items[0].amountCents).toBe(125000);
    expect(result.costOfLivingScenarios[1].items[0].amountCents).toBe(50000);
    expect(result.periods[0].grossIncomeItems[0].amountCents).toBe(300000);
    expect(result.periods[1].grossIncomeItems[0].amountCents).toBe(250000);
    expect(result.periods[1].extraExpenseItems[0].amountCents).toBe(75000);
  });

  it("applies a savings rate override to the matching period only", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      periodSavingsRateOverrides: [
        {
          id: "rate-override",
          periodId: "period-1",
          savingsRate: 50
        }
      ]
    });

    expect(plan.periods[0].savingsRate).toBe(20);
    expect(result.periods[0].savingsRate).toBe(50);
    expect(result.periods[1].savingsRate).toBe(95);
  });

  it("clamps savings rate overrides to the 0-100 range and ignores unknown periods", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      periodSavingsRateOverrides: [
        {
          id: "too-high",
          periodId: "period-1",
          savingsRate: 150
        },
        {
          id: "missing-period",
          periodId: "missing",
          savingsRate: 10
        }
      ]
    });

    expect(result.periods[0].savingsRate).toBe(100);
    expect(result.periods[1].savingsRate).toBe(95);
  });

  it("ignores item overrides that do not match the plan", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      costOfLivingItemOverrides: [
        {
          id: "missing-col",
          costOfLivingScenarioId: "missing",
          itemId: "rent",
          amountCents: 999999
        }
      ],
      periodItemOverrides: [
        {
          id: "missing-item",
          periodId: "period-2",
          itemKind: "extraExpense",
          itemId: "missing",
          amountCents: 999999
        }
      ]
    });

    expect(result.costOfLivingScenarios[0].items[0].amountCents).toBe(100000);
    expect(result.periods[1].extraExpenseItems[0].amountCents).toBe(50000);
  });

  it("summarizes projection deltas for the selected goal scenario", () => {
    const plan = basePlan();
    const whatIfPlan = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      periodItemOverrides: [
        {
          id: "income-override",
          periodId: "period-2",
          itemKind: "grossIncome",
          itemId: "contract",
          amountCents: 300000
        }
      ],
      selectedGoalId: "goal",
      selectedScenarioId: "scenario"
    });
    const comparison = createWhatIfComparison({
      baseProjection: projectPlan(plan),
      whatIfProjection: projectPlan(whatIfPlan),
      selectedGoalId: "goal",
      selectedScenarioId: "scenario"
    });

    expect(comparison.netWorthDeltaCents).toBeGreaterThan(0);
    expect(comparison.selectedGoal?.availableCashDeltaCents).toBeGreaterThan(0);
    expect(comparison.selectedGoal?.surplusDeltaCents).toBeGreaterThan(0);
  });
});
