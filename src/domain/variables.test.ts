import { describe, expect, it } from "vitest";
import {
  applyVariablesToPlan,
  bindFieldTo,
  describeFieldPath,
  findVariableForPath,
  getFieldValue,
  isSameFieldPath,
  pathKind,
  unbindFieldFrom
} from "./variables";
import { planDocumentSchema } from "./schemas";
import type { PlanDocument, VariableFieldPath } from "./types";

function basePlan(): PlanDocument {
  return {
    id: "plan",
    name: "Variables test",
    currency: "USD",
    startingSpendableCents: 100000,
    startingSavingsCents: 200000,
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
            amountCents: 100000,
            cadence: "monthly"
          }
        ]
      }
    ],
    periods: [
      {
        id: "period-1",
        name: "Fall",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        costOfLivingScenarioId: "col",
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
      }
    ],
    goals: [
      {
        id: "goal",
        name: "House",
        contributedFromSavingsCents: 0,
        scenarios: [
          {
            id: "scenario",
            name: "Starter",
            type: "house",
            targetDate: "2030-01-01",
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
          }
        ]
      }
    ],
    variables: []
  };
}

const rentPath: VariableFieldPath = {
  scope: "costItem",
  scenarioId: "col",
  itemId: "rent"
};
const jobPath: VariableFieldPath = {
  scope: "periodItem",
  periodId: "period-1",
  itemKind: "grossIncome",
  itemId: "job"
};
const downPaymentPath: VariableFieldPath = {
  scope: "houseField",
  goalId: "goal",
  scenarioId: "scenario",
  field: "downPaymentPercent"
};

describe("variable field paths", () => {
  it("classifies money vs percent fields", () => {
    expect(pathKind(rentPath)).toBe("money");
    expect(pathKind(jobPath)).toBe("money");
    expect(pathKind(downPaymentPath)).toBe("percent");
    expect(
      pathKind({ scope: "period", periodId: "period-1", field: "savingsRate" })
    ).toBe("percent");
  });

  it("compares paths structurally", () => {
    expect(isSameFieldPath(rentPath, { ...rentPath })).toBe(true);
    expect(isSameFieldPath(rentPath, jobPath)).toBe(false);
  });

  it("reads current field values", () => {
    const plan = basePlan();
    expect(getFieldValue(plan, rentPath)).toBe(100000);
    expect(getFieldValue(plan, downPaymentPath)).toBe(15);
    expect(
      getFieldValue(plan, { ...rentPath, itemId: "missing" })
    ).toBeUndefined();
  });
});

describe("applyVariablesToPlan", () => {
  it("writes the variable value into every bound field without mutating the input", () => {
    const plan = basePlan();
    plan.variables = [
      {
        id: "var-rent",
        name: "Monthly rent",
        kind: "money",
        value: 125000,
        bindings: [rentPath]
      }
    ];

    const result = applyVariablesToPlan(plan);

    expect(result.costOfLivingScenarios[0].items[0].amountCents).toBe(125000);
    // input untouched
    expect(plan.costOfLivingScenarios[0].items[0].amountCents).toBe(100000);
  });

  it("keeps multiple fields bound to one variable in sync", () => {
    const plan = basePlan();
    plan.variables = [
      {
        id: "var-shared",
        name: "Shared amount",
        kind: "money",
        value: 500000,
        bindings: [rentPath, jobPath]
      }
    ];

    const result = applyVariablesToPlan(plan);

    expect(result.costOfLivingScenarios[0].items[0].amountCents).toBe(500000);
    expect(result.periods[0].grossIncomeItems[0].amountCents).toBe(500000);
  });

  it("clamps percent variables to 0-100 and rounds money to whole cents", () => {
    const plan = basePlan();
    plan.variables = [
      {
        id: "var-down",
        name: "Down payment",
        kind: "percent",
        value: 250,
        bindings: [downPaymentPath]
      },
      {
        id: "var-rent",
        name: "Rent",
        kind: "money",
        value: 100000.6,
        bindings: [rentPath]
      }
    ];

    const result = applyVariablesToPlan(plan);

    expect(result.goals[0].scenarios[0].house?.downPaymentPercent).toBe(100);
    expect(result.costOfLivingScenarios[0].items[0].amountCents).toBe(100001);
  });

  it("prunes bindings whose target field no longer exists", () => {
    const plan = basePlan();
    plan.variables = [
      {
        id: "var-rent",
        name: "Rent",
        kind: "money",
        value: 125000,
        bindings: [rentPath, { ...rentPath, itemId: "deleted" }]
      }
    ];

    const result = applyVariablesToPlan(plan);

    expect(result.variables[0].bindings).toHaveLength(1);
    expect(result.variables[0].bindings[0]).toEqual(rentPath);
  });
});

describe("binding helpers", () => {
  it("moves a field from one variable to another", () => {
    const variables = [
      {
        id: "a",
        name: "A",
        kind: "money" as const,
        value: 1,
        bindings: [rentPath]
      },
      { id: "b", name: "B", kind: "money" as const, value: 2, bindings: [] }
    ];

    const rebound = bindFieldTo(variables, "b", rentPath);

    expect(findVariableForPath(rebound, rentPath)?.id).toBe("b");
    expect(rebound[0].bindings).toHaveLength(0);
  });

  it("detaches a field on unbind", () => {
    const variables = [
      {
        id: "a",
        name: "A",
        kind: "money" as const,
        value: 1,
        bindings: [rentPath, jobPath]
      }
    ];

    const result = unbindFieldFrom(variables, rentPath);

    expect(result[0].bindings).toEqual([jobPath]);
  });
});

describe("describeFieldPath", () => {
  it("produces a readable location label", () => {
    const plan = basePlan();
    expect(describeFieldPath(plan, rentPath)).toBe(
      "Cost of living · Base · Rent"
    );
    expect(describeFieldPath(plan, downPaymentPath)).toBe(
      "Goals · House · Starter · Down payment"
    );
  });
});

describe("plan schema", () => {
  it("round-trips variables with typed bindings", () => {
    const plan = basePlan();
    plan.variables = [
      {
        id: "var-1",
        name: "Rent",
        kind: "money",
        value: 125000,
        bindings: [rentPath, downPaymentPath]
      }
    ];

    const parsed = planDocumentSchema.parse(plan);

    expect(parsed.variables).toHaveLength(1);
    expect(parsed.variables[0].bindings).toEqual([rentPath, downPaymentPath]);
  });

  it("defaults variables to an empty array for older documents", () => {
    const plan = basePlan();
    const legacy = { ...plan } as Record<string, unknown>;
    delete legacy.variables;

    const parsed = planDocumentSchema.parse(legacy);

    expect(parsed.variables).toEqual([]);
  });
});
