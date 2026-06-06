import { describe, expect, it } from "vitest";
import { createSeedPlan } from "./sampleData";
import {
  estimateHousePaymentCents,
  normalizedMonthlyCents,
  projectPlan
} from "./projection";
import type { PlanDocument } from "./types";

function basePlan(): PlanDocument {
  return {
    id: "plan",
    name: "Test plan",
    currency: "USD",
    startingSpendableCents: 0,
    startingSavingsCents: 0,
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    costOfLivingScenarios: [
      {
        id: "col",
        name: "Base",
        items: []
      }
    ],
    periods: [],
    goals: []
  };
}

describe("projection engine", () => {
  it("normalizes yearly and weekly values into monthly cents", () => {
    expect(normalizedMonthlyCents(120000, "yearly")).toBe(10000);
    expect(normalizedMonthlyCents(10000, "weekly")).toBe(43333);
  });

  it("prorates mid-month periods by active days", () => {
    const plan = basePlan();
    plan.periods = [
      {
        id: "period",
        name: "Half month",
        startDate: "2026-04-01",
        endDate: "2026-04-15",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [
          {
            id: "income",
            name: "Job",
            category: "Work",
            amountCents: 300000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [],
        effectiveTaxRate: 10,
        savingsRate: 10,
        charityRate: 10
      }
    ];

    const result = projectPlan(plan);

    expect(result.months[0].grossIncomeCents).toBe(150000);
    expect(result.months[0].taxCents).toBe(15000);
    expect(result.months[0].plannedSavingsCents).toBe(13500);
    expect(result.months[0].charityCents).toBe(13500);
  });

  it("uses after-tax earned income as the basis for savings and charity", () => {
    const plan = basePlan();
    plan.periods = [
      {
        id: "period",
        name: "Full month",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [
          {
            id: "income",
            name: "Job",
            category: "Work",
            amountCents: 100000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [],
        effectiveTaxRate: 20,
        savingsRate: 25,
        charityRate: 10
      }
    ];

    const result = projectPlan(plan);

    expect(result.months[0].taxCents).toBe(20000);
    expect(result.months[0].afterTaxIncomeCents).toBe(80000);
    expect(result.months[0].plannedSavingsCents).toBe(20000);
    expect(result.months[0].charityCents).toBe(8000);
    expect(result.months[0].closingSavingsCents).toBe(20000);
    expect(result.months[0].closingSpendableCents).toBe(52000);
  });

  it("carries spendable cash into the next period without taxing it again", () => {
    const plan = basePlan();
    plan.periods = [
      {
        id: "one",
        name: "One",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [
          {
            id: "income",
            name: "Job",
            category: "Work",
            amountCents: 100000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      },
      {
        id: "two",
        name: "Two",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [],
        extraExpenseItems: [],
        effectiveTaxRate: 50,
        savingsRate: 50,
        charityRate: 50
      }
    ];

    const result = projectPlan(plan);

    expect(result.periodSummaries[1].carryoverInCents).toBe(100000);
    expect(result.months[1].taxCents).toBe(0);
    expect(result.months[1].closingSpendableCents).toBe(100000);
  });

  it("detects gaps and overlaps in sequential periods", () => {
    const plan = basePlan();
    plan.periods = [
      {
        id: "one",
        name: "One",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      },
      {
        id: "two",
        name: "Two",
        startDate: "2026-01-15",
        endDate: "2026-01-20",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      },
      {
        id: "three",
        name: "Three",
        startDate: "2026-01-20",
        endDate: "2026-01-30",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      }
    ];

    const result = projectPlan(plan);

    expect(result.warnings.some((warning) => warning.id.startsWith("gap"))).toBe(
      true
    );
    expect(
      result.warnings.some((warning) => warning.id.startsWith("overlap"))
    ).toBe(true);
  });

  it("evaluates goals against spendable cash plus savings", () => {
    const plan = basePlan();
    plan.startingSpendableCents = 50000;
    plan.startingSavingsCents = 50000;
    plan.periods = [
      {
        id: "period",
        name: "Month",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      }
    ];
    plan.goals = [
      {
        id: "goal",
        name: "Cash target",
        scenarios: [
          {
            id: "scenario",
            name: "Base",
            targetDate: "2026-01-15",
            targetAmountCents: 90000
          }
        ]
      }
    ];

    const result = projectPlan(plan);

    expect(result.goalResults[0].availableCashCents).toBe(100000);
    expect(result.goalResults[0].surplusOrShortfallCents).toBe(10000);
  });

  it("estimates house payment with principal, interest, taxes, insurance, and HOA", () => {
    const payment = estimateHousePaymentCents({
      purchasePriceCents: 40000000,
      downPaymentPercent: 20,
      closingCostPercent: 3,
      interestRatePercent: 6,
      loanTermYears: 30,
      annualPropertyTaxPercent: 1,
      monthlyInsuranceCents: 15000,
      monthlyHoaCents: 5000
    });

    expect(payment).toBeGreaterThan(210000);
    expect(payment).toBeLessThan(250000);
  });

  it("projects the seeded plan without crashing", () => {
    const result = projectPlan(createSeedPlan());

    expect(result.months.length).toBeGreaterThan(12);
    expect(result.goalResults.length).toBe(2);
  });
});
