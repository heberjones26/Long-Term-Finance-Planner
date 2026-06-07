import { createId } from "./ids";
import type {
  FinancialPeriod,
  GoalResult,
  HouseGoalFields,
  LocalDate,
  MoneyCents,
  PlanDocument,
  ProjectionResult,
  RecurringMoneyItem
} from "./types";

export type WhatIfInputs = {
  incomeMultiplier: number;
  savingsRateDelta: number;
  costOfLivingScenarioId?: string;
  selectedPeriodId?: string;
  oneTimeExpenseCents: MoneyCents;
  selectedGoalId?: string;
  selectedScenarioId?: string;
  goalTargetDate?: LocalDate;
  house?: Partial<HouseGoalFields>;
};

export type WhatIfGoalComparison = {
  base: GoalResult | undefined;
  whatIf: GoalResult | undefined;
  availableCashDeltaCents: MoneyCents;
  requiredCashDeltaCents: MoneyCents;
  surplusDeltaCents: MoneyCents;
  paymentDeltaCents: MoneyCents;
};

export type WhatIfComparison = {
  netWorthDeltaCents: MoneyCents;
  savingsDeltaCents: MoneyCents;
  spendableDeltaCents: MoneyCents;
  cumulativeTaxDeltaCents: MoneyCents;
  selectedGoal?: WhatIfGoalComparison;
};

export const defaultWhatIfInputs: WhatIfInputs = {
  incomeMultiplier: 1,
  savingsRateDelta: 0,
  oneTimeExpenseCents: 0
};

export function applyWhatIfInputs(
  plan: PlanDocument,
  inputs: WhatIfInputs
): PlanDocument {
  const nextPlan = structuredClone(plan);
  const incomeMultiplier = sanitizeMultiplier(inputs.incomeMultiplier);
  const savingsRateDelta = sanitizeNumber(inputs.savingsRateDelta);

  for (const period of nextPlan.periods) {
    period.grossIncomeItems = period.grossIncomeItems.map((item) => ({
      ...item,
      amountCents: clampMoney(Math.round(item.amountCents * incomeMultiplier))
    }));
    period.savingsRate = clampPercent(period.savingsRate + savingsRateDelta);
  }

  if (
    inputs.costOfLivingScenarioId &&
    nextPlan.costOfLivingScenarios.some(
      (scenario) => scenario.id === inputs.costOfLivingScenarioId
    )
  ) {
    for (const period of nextPlan.periods) {
      period.costOfLivingScenarioId = inputs.costOfLivingScenarioId;
    }
  }

  const selectedPeriod = nextPlan.periods.find(
    (period) => period.id === inputs.selectedPeriodId
  );
  const oneTimeExpenseCents = clampMoney(inputs.oneTimeExpenseCents);
  if (selectedPeriod && oneTimeExpenseCents > 0) {
    selectedPeriod.extraExpenseItems.push(
      createWhatIfExpense(selectedPeriod, oneTimeExpenseCents)
    );
  }

  const selectedGoal = nextPlan.goals.find(
    (goal) => goal.id === inputs.selectedGoalId
  );
  const selectedScenario = selectedGoal?.scenarios.find(
    (scenario) => scenario.id === inputs.selectedScenarioId
  );
  if (selectedScenario) {
    if (isLocalDate(inputs.goalTargetDate)) {
      selectedScenario.targetDate = inputs.goalTargetDate;
    }
    if (
      (selectedScenario.type === "house" ||
        (!selectedScenario.type && selectedScenario.house)) &&
      selectedScenario.house &&
      inputs.house
    ) {
      selectedScenario.house = applyHouseOverrides(
        selectedScenario.house,
        inputs.house
      );
    }
  }

  return nextPlan;
}

export function createWhatIfComparison({
  baseProjection,
  selectedGoalId,
  selectedScenarioId,
  whatIfProjection
}: {
  baseProjection: ProjectionResult;
  whatIfProjection: ProjectionResult;
  selectedGoalId?: string;
  selectedScenarioId?: string;
}): WhatIfComparison {
  const selectedGoal =
    selectedGoalId && selectedScenarioId
      ? createGoalComparison(
          findGoalResult(baseProjection, selectedGoalId, selectedScenarioId),
          findGoalResult(whatIfProjection, selectedGoalId, selectedScenarioId)
        )
      : undefined;

  return {
    netWorthDeltaCents:
      whatIfProjection.totals.endingNetWorthCents -
      baseProjection.totals.endingNetWorthCents,
    savingsDeltaCents:
      whatIfProjection.totals.endingSavingsCents -
      baseProjection.totals.endingSavingsCents,
    spendableDeltaCents:
      whatIfProjection.totals.endingSpendableCents -
      baseProjection.totals.endingSpendableCents,
    cumulativeTaxDeltaCents:
      whatIfProjection.totals.cumulativeTaxCents -
      baseProjection.totals.cumulativeTaxCents,
    selectedGoal
  };
}

function createWhatIfExpense(
  period: FinancialPeriod,
  amountCents: MoneyCents
): RecurringMoneyItem {
  return {
    id: createId("what_if_expense"),
    name: "What-if expense",
    category: "What-if",
    amountCents,
    cadence: "oneTime",
    date: period.startDate,
    enabled: true
  };
}

function applyHouseOverrides(
  fields: HouseGoalFields,
  overrides: Partial<HouseGoalFields>
): HouseGoalFields {
  return {
    purchasePriceCents: sanitizeMoneyOverride(
      overrides.purchasePriceCents,
      fields.purchasePriceCents
    ),
    downPaymentPercent: sanitizePercentOverride(
      overrides.downPaymentPercent,
      fields.downPaymentPercent
    ),
    closingCostPercent: sanitizePercentOverride(
      overrides.closingCostPercent,
      fields.closingCostPercent
    ),
    interestRatePercent: sanitizePercentOverride(
      overrides.interestRatePercent,
      fields.interestRatePercent
    ),
    loanTermYears: sanitizeLoanTermOverride(
      overrides.loanTermYears,
      fields.loanTermYears
    ),
    annualPropertyTaxPercent: sanitizePercentOverride(
      overrides.annualPropertyTaxPercent,
      fields.annualPropertyTaxPercent
    ),
    monthlyInsuranceCents: sanitizeMoneyOverride(
      overrides.monthlyInsuranceCents,
      fields.monthlyInsuranceCents
    ),
    monthlyHoaCents: sanitizeMoneyOverride(
      overrides.monthlyHoaCents,
      fields.monthlyHoaCents
    )
  };
}

function createGoalComparison(
  base: GoalResult | undefined,
  whatIf: GoalResult | undefined
): WhatIfGoalComparison {
  return {
    base,
    whatIf,
    availableCashDeltaCents:
      (whatIf?.availableCashCents ?? 0) - (base?.availableCashCents ?? 0),
    requiredCashDeltaCents:
      (whatIf?.requiredCashCents ?? 0) - (base?.requiredCashCents ?? 0),
    surplusDeltaCents:
      (whatIf?.surplusOrShortfallCents ?? 0) -
      (base?.surplusOrShortfallCents ?? 0),
    paymentDeltaCents:
      (whatIf?.estimatedMonthlyPaymentCents ?? 0) -
      (base?.estimatedMonthlyPaymentCents ?? 0)
  };
}

function findGoalResult(
  projection: ProjectionResult,
  goalId: string,
  scenarioId: string
): GoalResult | undefined {
  return projection.goalResults.find(
    (result) => result.goalId === goalId && result.scenarioId === scenarioId
  );
}

function sanitizeMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(value, 0);
}

function sanitizeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function sanitizeMoneyOverride(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : clampMoney(value);
}

function sanitizePercentOverride(
  value: number | undefined,
  fallback: number
): number {
  return value === undefined ? fallback : clampPercent(value);
}

function sanitizeLoanTermOverride(
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(value), 1), 40);
}

function clampMoney(value: number): MoneyCents {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.round(value), 0);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

function isLocalDate(value: string | undefined): value is LocalDate {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
