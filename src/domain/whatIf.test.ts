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
        extraExpenseItems: [],
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
  it("applies global period controls without mutating the source plan", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      incomeMultiplier: 1.1,
      savingsRateDelta: 10,
      costOfLivingScenarioId: "lean-col"
    });

    expect(plan.periods[0].grossIncomeItems[0].amountCents).toBe(300000);
    expect(plan.periods[0].savingsRate).toBe(20);
    expect(plan.periods[0].costOfLivingScenarioId).toBe("base-col");
    expect(result.periods[0].grossIncomeItems[0].amountCents).toBe(330000);
    expect(result.periods[1].grossIncomeItems[0].amountCents).toBe(220000);
    expect(result.periods[0].savingsRate).toBe(30);
    expect(result.periods[1].savingsRate).toBe(100);
    expect(result.periods.every((period) => period.costOfLivingScenarioId === "lean-col")).toBe(true);
  });

  it("adds a one-time expense only to the selected period", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      selectedPeriodId: "period-2",
      oneTimeExpenseCents: 12345
    });

    expect(plan.periods[1].extraExpenseItems).toHaveLength(0);
    expect(result.periods[0].extraExpenseItems).toHaveLength(0);
    expect(result.periods[1].extraExpenseItems).toMatchObject([
      {
        name: "What-if expense",
        category: "What-if",
        amountCents: 12345,
        cadence: "oneTime",
        date: "2026-02-01",
        enabled: true
      }
    ]);
    expect(result.periods[1].extraExpenseItems[0].id).toMatch(
      /^what_if_expense_/
    );
  });

  it("updates the selected goal scenario and house assumptions", () => {
    const plan = basePlan();
    const result = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      selectedGoalId: "goal",
      selectedScenarioId: "scenario",
      goalTargetDate: "2026-03-01",
      house: {
        purchasePriceCents: 35000000,
        interestRatePercent: 7,
        loanTermYears: 50
      }
    });
    const scenario = result.goals[0].scenarios[0];

    expect(plan.goals[0].scenarios[0].targetDate).toBe("2026-02-01");
    expect(scenario.targetDate).toBe("2026-03-01");
    expect(scenario.house?.purchasePriceCents).toBe(35000000);
    expect(scenario.house?.interestRatePercent).toBe(7);
    expect(scenario.house?.loanTermYears).toBe(40);
  });

  it("summarizes projection deltas for the selected goal scenario", () => {
    const plan = basePlan();
    const whatIfPlan = applyWhatIfInputs(plan, {
      ...defaultWhatIfInputs,
      incomeMultiplier: 1.25,
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
