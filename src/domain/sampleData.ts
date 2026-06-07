import { createId } from "./ids";
import type { PlanDocument } from "./types";

const nowIso = () => new Date().toISOString();

export function createBlankPlan(): PlanDocument {
  const timestamp = nowIso();

  return {
    id: createId("plan"),
    name: "Untitled plan",
    currency: "USD",
    startingSpendableCents: 0,
    startingSavingsCents: 0,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    costOfLivingScenarios: [
      {
        id: createId("col"),
        name: "Default",
        notes: "",
        items: []
      }
    ],
    periods: [],
    goals: []
  };
}

export function createSeedPlan(): PlanDocument {
  const semesterColId = createId("col");
  const leanColId = createId("col");
  const fallPeriodId = createId("period");
  const springPeriodId = createId("period");
  const summerPeriodId = createId("period");
  const houseGoalId = createId("goal");
  const targetScenarioId = createId("goal_scenario");
  const stretchScenarioId = createId("goal_scenario");
  const timestamp = nowIso();

  return {
    id: createId("plan"),
    name: "My long-term plan",
    currency: "USD",
    startingSpendableCents: 250000,
    startingSavingsCents: 1200000,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    costOfLivingScenarios: [
      {
        id: semesterColId,
        name: "Semester living",
        notes: "Baseline expenses during school months.",
        items: [
          {
            id: createId("cost"),
            name: "Rent",
            category: "Housing",
            amountCents: 110000,
            cadence: "monthly"
          },
          {
            id: createId("cost"),
            name: "Groceries",
            category: "Food",
            amountCents: 42000,
            cadence: "monthly"
          },
          {
            id: createId("cost"),
            name: "Car insurance",
            category: "Transportation",
            amountCents: 156000,
            cadence: "yearly"
          },
          {
            id: createId("cost"),
            name: "Subscriptions",
            category: "Personal",
            amountCents: 48000,
            cadence: "yearly"
          }
        ]
      },
      {
        id: leanColId,
        name: "Lean summer",
        notes: "Lower rent and tighter discretionary spending.",
        items: [
          {
            id: createId("cost"),
            name: "Rent",
            category: "Housing",
            amountCents: 85000,
            cadence: "monthly"
          },
          {
            id: createId("cost"),
            name: "Groceries",
            category: "Food",
            amountCents: 36000,
            cadence: "monthly"
          },
          {
            id: createId("cost"),
            name: "Car insurance",
            category: "Transportation",
            amountCents: 156000,
            cadence: "yearly"
          }
        ]
      }
    ],
    periods: [
      {
        id: fallPeriodId,
        name: "Fall semester",
        startDate: "2026-08-08",
        endDate: "2026-12-10",
        costOfLivingScenarioId: semesterColId,
        effectiveTaxRate: 12,
        taxFilingStatus: "single",
        additionalTaxRate: 0,
        savingsRate: 15,
        charityRate: 10,
        grossIncomeItems: [
          {
            id: createId("income"),
            name: "Part-time work",
            category: "Work",
            amountCents: 240000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [
          {
            id: createId("expense"),
            name: "Books and course fees",
            category: "School",
            amountCents: 65000,
            cadence: "oneTime",
            date: "2026-08-20"
          }
        ]
      },
      {
        id: springPeriodId,
        name: "Spring semester",
        startDate: "2027-01-08",
        endDate: "2027-05-05",
        costOfLivingScenarioId: semesterColId,
        effectiveTaxRate: 12,
        taxFilingStatus: "single",
        additionalTaxRate: 0,
        savingsRate: 18,
        charityRate: 10,
        grossIncomeItems: [
          {
            id: createId("income"),
            name: "Part-time work",
            category: "Work",
            amountCents: 260000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: []
      },
      {
        id: summerPeriodId,
        name: "Summer work",
        startDate: "2027-05-20",
        endDate: "2027-08-05",
        costOfLivingScenarioId: leanColId,
        effectiveTaxRate: 18,
        taxFilingStatus: "single",
        additionalTaxRate: 0,
        savingsRate: 35,
        charityRate: 10,
        grossIncomeItems: [
          {
            id: createId("income"),
            name: "Internship",
            category: "Work",
            amountCents: 560000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [
          {
            id: createId("expense"),
            name: "Moving buffer",
            category: "Transition",
            amountCents: 70000,
            cadence: "oneTime",
            date: "2027-05-22"
          }
        ]
      }
    ],
    goals: [
      {
        id: houseGoalId,
        name: "Buy a house",
        contributedFromSavingsCents: 0,
        notes: "Compare realistic and stretch down-payment paths.",
        scenarios: [
          {
            id: targetScenarioId,
            name: "Starter home",
            type: "house",
            targetDate: "2030-06-01",
            targetAmountCents: 6000000,
            house: {
              purchasePriceCents: 35000000,
              downPaymentPercent: 15,
              closingCostPercent: 3,
              interestRatePercent: 6.5,
              loanTermYears: 30,
              annualPropertyTaxPercent: 0.75,
              monthlyInsuranceCents: 17500,
              monthlyHoaCents: 0
            }
          },
          {
            id: stretchScenarioId,
            name: "20% down",
            type: "house",
            targetDate: "2030-06-01",
            targetAmountCents: 8000000,
            house: {
              purchasePriceCents: 40000000,
              downPaymentPercent: 20,
              closingCostPercent: 3,
              interestRatePercent: 6.5,
              loanTermYears: 30,
              annualPropertyTaxPercent: 0.75,
              monthlyInsuranceCents: 20000,
              monthlyHoaCents: 0
            }
          }
        ]
      }
    ]
  };
}
