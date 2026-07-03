import type {
  GoalResult,
  Id,
  MoneyCents,
  PlanDocument,
  ProjectionResult
} from "./types";

export type WhatIfPeriodItemKind = "grossIncome" | "extraExpense";

export type WhatIfCostOfLivingItemOverride = {
  id: Id;
  costOfLivingScenarioId: Id;
  itemId: Id;
  amountCents: MoneyCents;
};

export type WhatIfPeriodItemOverride = {
  id: Id;
  periodId: Id;
  itemKind: WhatIfPeriodItemKind;
  itemId: Id;
  amountCents: MoneyCents;
};

export type WhatIfPeriodSavingsRateOverride = {
  id: Id;
  periodId: Id;
  savingsRate: number;
};

export type WhatIfInputs = {
  costOfLivingItemOverrides: WhatIfCostOfLivingItemOverride[];
  periodItemOverrides: WhatIfPeriodItemOverride[];
  periodSavingsRateOverrides: WhatIfPeriodSavingsRateOverride[];
  selectedGoalId?: string;
  selectedScenarioId?: string;
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
  costOfLivingItemOverrides: [],
  periodItemOverrides: [],
  periodSavingsRateOverrides: []
};

export function applyWhatIfInputs(
  plan: PlanDocument,
  inputs: WhatIfInputs
): PlanDocument {
  const nextPlan = structuredClone(plan);

  for (const override of inputs.costOfLivingItemOverrides ?? []) {
    const scenario = nextPlan.costOfLivingScenarios.find(
      (item) => item.id === override.costOfLivingScenarioId
    );
    const costItem = scenario?.items.find((item) => item.id === override.itemId);
    if (costItem) {
      costItem.amountCents = clampMoney(override.amountCents);
    }
  }

  for (const override of inputs.periodItemOverrides ?? []) {
    const period = nextPlan.periods.find(
      (item) => item.id === override.periodId
    );
    const items =
      override.itemKind === "grossIncome"
        ? period?.grossIncomeItems
        : period?.extraExpenseItems;
    const periodItem = items?.find((item) => item.id === override.itemId);
    if (periodItem) {
      periodItem.amountCents = clampMoney(override.amountCents);
    }
  }

  for (const override of inputs.periodSavingsRateOverrides ?? []) {
    const period = nextPlan.periods.find(
      (item) => item.id === override.periodId
    );
    if (period) {
      period.savingsRate = clampRate(override.savingsRate);
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

function clampMoney(value: number): MoneyCents {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.round(value), 0);
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}
