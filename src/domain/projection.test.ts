import { describe, expect, it } from "vitest";
import { createBlankPlan, createSeedPlan } from "./sampleData";
import {
  calculateHouseAmortization,
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
    goals: [],
    variables: []
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
    expect(result.months[0].taxCents).toBe(20392);
    expect(result.months[0].plannedSavingsCents).toBe(12961);
    expect(result.months[0].charityCents).toBe(12961);
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
        effectiveTaxRate: 0,
        savingsRate: 25,
        charityRate: 10
      }
    ];

    const result = projectPlan(plan);

    expect(result.months[0].taxCents).toBe(7650);
    expect(result.months[0].afterTaxIncomeCents).toBe(92350);
    expect(result.months[0].plannedSavingsCents).toBe(23088);
    expect(result.months[0].charityCents).toBe(9235);
    expect(result.months[0].closingSavingsCents).toBe(23088);
    expect(result.months[0].closingSpendableCents).toBe(60027);
  });

  it("limits the projection horizon when an end date is supplied", () => {
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
        effectiveTaxRate: 0,
        savingsRate: 25,
        charityRate: 10
      }
    ];
    plan.goals = [
      {
        id: "goal",
        name: "Cash goal",
        scenarios: [
          {
            id: "scenario",
            name: "Target",
            targetDate: "2026-12-01",
            targetAmountCents: 0
          }
        ]
      }
    ];

    const result = projectPlan(plan, { endDate: "2026-01-31" });
    const finalMonth = result.months.at(-1);

    expect(result.months).toHaveLength(1);
    expect(finalMonth?.month).toBe("2026-01");
    expect(result.goalResults[0].availableCashCents).toBe(
      (finalMonth?.closingSpendableCents ?? 0) +
        (finalMonth?.closingSavingsCents ?? 0)
    );
  });

  it("calculates period profit as retained net-worth growth", () => {
    const plan = basePlan();
    plan.startingSpendableCents = 500000;
    plan.startingSavingsCents = 200000;
    plan.costOfLivingScenarios[0].items = [
      {
        id: "rent",
        name: "Rent",
        category: "Housing",
        amountCents: 20000,
        cadence: "monthly"
      }
    ];
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
        effectiveTaxRate: 0,
        savingsRate: 25,
        charityRate: 10
      }
    ];

    const result = projectPlan(plan);
    const summary = result.periodSummaries[0];

    expect(summary.carryoverInCents).toBe(500000);
    expect(summary.spendableEndingCents).toBe(540027);
    expect(summary.savingsEndingCents).toBe(223088);
    expect(summary.profitCents).toBe(63115);
  });

  it("excludes disabled income, expense, and cost-of-living items", () => {
    const plan = basePlan();
    plan.costOfLivingScenarios[0].items = [
      {
        id: "rent",
        name: "Rent",
        category: "Housing",
        amountCents: 10000,
        cadence: "monthly"
      },
      {
        id: "parking",
        name: "Parking",
        category: "Transportation",
        amountCents: 50000,
        cadence: "monthly",
        enabled: false
      }
    ];
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
          },
          {
            id: "disabled-income",
            name: "Unused offer",
            category: "Work",
            amountCents: 900000,
            cadence: "monthly",
            enabled: false
          }
        ],
        extraExpenseItems: [
          {
            id: "books",
            name: "Books",
            category: "School",
            amountCents: 20000,
            cadence: "monthly"
          },
          {
            id: "disabled-books",
            name: "Optional fees",
            category: "School",
            amountCents: 30000,
            cadence: "monthly",
            enabled: false
          }
        ],
        effectiveTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      }
    ];

    const result = projectPlan(plan);

    expect(result.months[0].grossIncomeCents).toBe(100000);
    expect(result.months[0].taxCents).toBe(7650);
    expect(result.months[0].costOfLivingCents).toBe(10000);
    expect(result.months[0].extraExpenseCents).toBe(20000);
    expect(result.months[0].closingSpendableCents).toBe(62350);
    expect(result.periodSummaries[0].annualizedGrossIncomeCents).toBe(1200000);
  });

  it("adds optional state and local estimate into the calculated tax rate", () => {
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
        effectiveTaxRate: 0,
        taxFilingStatus: "single",
        additionalTaxRate: 5,
        savingsRate: 0,
        charityRate: 0
      }
    ];

    const result = projectPlan(plan);

    expect(result.periodSummaries[0].calculatedTaxRate).toBeCloseTo(12.65, 2);
    expect(result.months[0].taxCents).toBe(12650);
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

    expect(result.periodSummaries[1].carryoverInCents).toBe(92350);
    expect(result.months[1].taxCents).toBe(0);
    expect(result.months[1].closingSpendableCents).toBe(92350);
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

  it("reserves goal contributions from savings without increasing net worth", () => {
    const plan = basePlan();
    plan.startingSavingsCents = 100000;
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
        id: "house",
        name: "House",
        contributedFromSavingsCents: 30000,
        scenarios: [
          {
            id: "house-base",
            name: "Base",
            targetDate: "2026-01-15",
            targetAmountCents: 80000
          }
        ]
      },
      {
        id: "car",
        name: "Car",
        contributedFromSavingsCents: 20000,
        scenarios: [
          {
            id: "car-base",
            name: "Base",
            targetDate: "2026-01-15",
            targetAmountCents: 80000
          }
        ]
      }
    ];

    const result = projectPlan(plan);
    const houseResult = result.goalResults.find(
      (item) => item.goalId === "house"
    );
    const carResult = result.goalResults.find((item) => item.goalId === "car");

    expect(result.months[0].openingSavingsCents).toBe(100000);
    expect(result.totals.endingSavingsCents).toBe(100000);
    expect(result.totals.reservedGoalContributionCents).toBe(50000);
    expect(result.totals.endingAvailableCents).toBe(100000);
    expect(result.totals.endingNetWorthCents).toBe(100000);
    expect(houseResult?.unallocatedAvailableCashCents).toBe(50000);
    expect(houseResult?.contributedFromSavingsCents).toBe(30000);
    expect(houseResult?.availableCashCents).toBe(80000);
    expect(carResult?.availableCashCents).toBe(70000);
  });

  it("uses goal contributions when calculating available house down payment", () => {
    const plan = basePlan();
    plan.startingSavingsCents = 5891934;
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
        id: "house",
        name: "House",
        contributedFromSavingsCents: 3000000,
        scenarios: [
          {
            id: "house-base",
            name: "Base",
            targetDate: "2026-01-15",
            targetAmountCents: 0,
            house: {
              purchasePriceCents: 10000000,
              downPaymentPercent: 20,
              closingCostPercent: 3,
              interestRatePercent: 6,
              loanTermYears: 30,
              annualPropertyTaxPercent: 1,
              monthlyInsuranceCents: 0,
              monthlyHoaCents: 0
            }
          }
        ]
      },
    ];

    const result = projectPlan(plan);
    const houseResult = result.goalResults.find(
      (item) => item.goalId === "house"
    );

    expect(houseResult?.unallocatedAvailableCashCents).toBe(2891934);
    expect(houseResult?.availableCashCents).toBe(5891934);
    expect(houseResult?.requiredCashCents).toBe(2300000);
    expect(houseResult?.requiredDownPaymentCents).toBe(2000000);
    expect(houseResult?.requiredClosingCostCents).toBe(300000);
    expect(houseResult?.availableDownPaymentCents).toBe(5591934);
    expect(houseResult?.availableDownPaymentPercent).toBeCloseTo(55.92, 2);
  });

  it("treats explicit other goals as generic even if stale house fields exist", () => {
    const plan = basePlan();
    plan.startingSavingsCents = 100000;
    plan.goals = [
      {
        id: "goal",
        name: "Emergency fund",
        scenarios: [
          {
            id: "scenario",
            name: "Base",
            type: "other",
            targetDate: "2026-01-15",
            targetAmountCents: 50000,
            house: {
              purchasePriceCents: 10000000,
              downPaymentPercent: 20,
              closingCostPercent: 3,
              interestRatePercent: 6,
              loanTermYears: 30,
              annualPropertyTaxPercent: 1,
              monthlyInsuranceCents: 0,
              monthlyHoaCents: 0
            }
          }
        ]
      }
    ];

    const result = projectPlan(plan);

    expect(result.goalResults[0].requiredCashCents).toBe(50000);
    expect(result.goalResults[0].estimatedMonthlyPaymentCents).toBeUndefined();
    expect(result.goalResults[0].requiredDownPaymentCents).toBeUndefined();
  });

  it("warns when goal contributions exceed starting savings", () => {
    const plan = basePlan();
    plan.startingSavingsCents = 10000;
    plan.goals = [
      {
        id: "goal",
        name: "Goal",
        contributedFromSavingsCents: 20000,
        scenarios: [
          {
            id: "scenario",
            name: "Base",
            targetDate: "2026-01-15",
            targetAmountCents: 20000
          }
        ]
      }
    ];

    const result = projectPlan(plan);

    expect(
      result.warnings.some(
        (warning) => warning.id === "goal-contribution-over-savings"
      )
    ).toBe(true);
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

  it("calculates a house amortization schedule and payment breakdown", () => {
    const amortization = calculateHouseAmortization({
      purchasePriceCents: 40000000,
      downPaymentPercent: 20,
      closingCostPercent: 3,
      interestRatePercent: 6,
      loanTermYears: 30,
      annualPropertyTaxPercent: 1,
      monthlyInsuranceCents: 15000,
      monthlyHoaCents: 5000
    });

    expect(amortization.loanPrincipalCents).toBe(32000000);
    expect(amortization.schedule).toHaveLength(360);
    expect(amortization.monthlyPrincipalInterestCents).toBeGreaterThan(190000);
    expect(amortization.monthlyPropertyTaxCents).toBe(33333);
    expect(amortization.totalMonthlyPaymentCents).toBeGreaterThan(240000);
    expect(amortization.totalPrincipalCents).toBe(32000000);
    expect(amortization.totalInterestCents).toBeGreaterThan(0);
    expect(amortization.firstYearInterestCents).toBeGreaterThan(
      amortization.firstYearPrincipalCents
    );
    expect(amortization.schedule[0].interestCents).toBe(160000);
    expect(amortization.schedule.at(-1)?.remainingPrincipalCents).toBe(0);
  });

  it("projects the seeded plan without crashing", () => {
    const result = projectPlan(createSeedPlan());

    expect(result.months.length).toBeGreaterThan(12);
    expect(result.goalResults.length).toBe(2);
  });

  it("projects a blank plan without demo data", () => {
    const result = projectPlan(createBlankPlan());

    expect(result.months).toHaveLength(1);
    expect(result.goalResults).toHaveLength(0);
    expect(result.totals.endingAvailableCents).toBe(0);
    expect(result.totals.endingNetWorthCents).toBe(0);
  });
});
