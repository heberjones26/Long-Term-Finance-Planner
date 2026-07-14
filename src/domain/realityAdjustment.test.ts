import { describe, expect, it } from "vitest";
import { projectPlan } from "./projection";
import { analyzeRealityAdjustment } from "./realityAdjustment";
import type { PlanDocument } from "./types";

function basePlan(): PlanDocument {
  return {
    id: "plan",
    name: "Reality adjustment test",
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
        items: [
          {
            id: "rent",
            name: "Rent",
            category: "Housing",
            amountCents: 150000,
            cadence: "monthly"
          }
        ]
      }
    ],
    periods: [
      {
        id: "audit-period",
        name: "Audited month",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [
          {
            id: "income",
            name: "Salary",
            category: "Work",
            amountCents: 1000000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 30,
        charityRate: 5
      },
      {
        id: "future-period",
        name: "Future months",
        startDate: "2026-02-01",
        endDate: "2026-03-31",
        costOfLivingScenarioId: "col",
        grossIncomeItems: [
          {
            id: "income",
            name: "Salary",
            category: "Work",
            amountCents: 1000000,
            cadence: "monthly"
          }
        ],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        savingsRate: 30,
        charityRate: 5
      }
    ],
    goals: [
      {
        id: "house",
        name: "House",
        scenarios: [
          {
            id: "house-base",
            name: "Base",
            targetDate: "2026-03-01",
            targetAmountCents: 1200000
          }
        ]
      }
    ],
    variables: []
  };
}

describe("reality adjustment", () => {
  it("derives drift ratios from completed audits and adjusts projected net worth", () => {
    const plan = basePlan();
    const initialProjection = projectPlan(plan);
    const auditedSummary = initialProjection.periodSummaries.find(
      (summary) => summary.periodId === "audit-period"
    );

    expect(auditedSummary).toBeDefined();
    plan.periods[0].audit = {
      actualGrossIncomeCents: Math.round(auditedSummary!.grossIncomeCents * 0.85),
      actualTaxCents: Math.round(auditedSummary!.taxCents * 1.03),
      actualCostOfLivingCents: Math.round(
        auditedSummary!.costOfLivingCents * 1.07
      ),
      actualExtraExpenseCents: auditedSummary!.extraExpenseCents,
      actualCharityCents: auditedSummary!.charityCents,
      actualSavingsCents: Math.round(auditedSummary!.plannedSavingsCents * 0.82),
      completedAt: "2026-02-01T00:00:00.000Z"
    };

    const projection = projectPlan(plan);
    const adjustment = analyzeRealityAdjustment(plan, projection);
    const costOfLivingMetric = adjustment.metrics.find(
      (metric) => metric.key === "costOfLiving"
    );
    const savingsMetric = adjustment.metrics.find(
      (metric) => metric.key === "savings"
    );
    const taxesMetric = adjustment.metrics.find(
      (metric) => metric.key === "taxes"
    );

    expect(adjustment.auditCount).toBe(1);
    expect(adjustment.hasAuditSignal).toBe(true);
    expect(costOfLivingMetric?.ratio).toBeCloseTo(1.07, 2);
    expect(savingsMetric?.ratio).toBeCloseTo(0.82, 2);
    expect(taxesMetric?.ratio).toBeCloseTo(1.03, 2);
    expect(adjustment.months.at(-1)?.adjustedNetWorthCents).toBeLessThan(
      adjustment.months.at(-1)?.plannedNetWorthCents ?? 0
    );
    expect(adjustment.goalImpacts[0].adjustedAvailableCents).toBeLessThan(
      adjustment.goalImpacts[0].plannedAvailableCents
    );
  });

  it("returns a no-signal result when there are no completed audits", () => {
    const plan = basePlan();
    const projection = projectPlan(plan);
    const adjustment = analyzeRealityAdjustment(plan, projection);

    expect(adjustment.auditCount).toBe(0);
    expect(adjustment.hasAuditSignal).toBe(false);
    expect(adjustment.biggestDrifts).toEqual([]);
    expect(adjustment.months[0].adjustedNetWorthCents).toBe(
      adjustment.months[0].plannedNetWorthCents
    );
  });
});
