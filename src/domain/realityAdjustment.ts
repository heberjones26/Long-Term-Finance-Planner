import type {
  GoalResult,
  MoneyCents,
  PlanDocument,
  ProjectionMonth,
  ProjectionResult
} from "./types";

export type RealityDriftMetricKey =
  | "grossIncome"
  | "taxes"
  | "costOfLiving"
  | "extraExpenses"
  | "charity"
  | "savings";

export type RealityDriftMetric = {
  key: RealityDriftMetricKey;
  label: string;
  plannedCents: MoneyCents;
  actualCents: MoneyCents;
  deltaCents: MoneyCents;
  impactCents: MoneyCents;
  ratio: number | null;
  role: "income" | "outflow" | "savings";
};

export type RealityAdjustedMonth = {
  month: string;
  label: string;
  plannedNetWorthCents: MoneyCents;
  adjustedSpendableCents: MoneyCents;
  adjustedSavingsCents: MoneyCents;
  adjustedNetWorthCents: MoneyCents;
  adjustedCumulativeTaxCents: MoneyCents;
  netWorthDeltaCents: MoneyCents;
};

export type RealityGoalImpact = {
  goalId: string;
  goalName: string;
  scenarioId: string;
  scenarioName: string;
  plannedTargetMonth: string;
  plannedTargetLabel: string;
  adjustedTargetMonth: string | null;
  adjustedTargetLabel: string | null;
  monthDelta: number | null;
  plannedAvailableCents: MoneyCents;
  adjustedAvailableCents: MoneyCents;
  requiredCashCents: MoneyCents;
};

export type RealityAdjustmentResult = {
  auditCount: number;
  hasAuditSignal: boolean;
  metrics: RealityDriftMetric[];
  biggestDrifts: RealityDriftMetric[];
  months: RealityAdjustedMonth[];
  goalImpacts: RealityGoalImpact[];
};

type MetricDefinition = {
  key: RealityDriftMetricKey;
  label: string;
  role: RealityDriftMetric["role"];
  planned: (summary: ProjectionResult["periodSummaries"][number]) => MoneyCents;
  actual: (audit: NonNullable<PlanDocument["periods"][number]["audit"]>) => MoneyCents;
};

const metricDefinitions: MetricDefinition[] = [
  {
    key: "grossIncome",
    label: "Gross income",
    role: "income",
    planned: (summary) => summary.grossIncomeCents,
    actual: (audit) => audit.actualGrossIncomeCents
  },
  {
    key: "taxes",
    label: "Taxes",
    role: "outflow",
    planned: (summary) => summary.taxCents,
    actual: (audit) => audit.actualTaxCents
  },
  {
    key: "costOfLiving",
    label: "Cost of living",
    role: "outflow",
    planned: (summary) => summary.costOfLivingCents,
    actual: (audit) => audit.actualCostOfLivingCents
  },
  {
    key: "extraExpenses",
    label: "Extra expenses",
    role: "outflow",
    planned: (summary) => summary.extraExpenseCents,
    actual: (audit) => audit.actualExtraExpenseCents
  },
  {
    key: "charity",
    label: "Charity",
    role: "outflow",
    planned: (summary) => summary.charityCents,
    actual: (audit) => audit.actualCharityCents
  },
  {
    key: "savings",
    label: "Savings follow-through",
    role: "savings",
    planned: (summary) => summary.plannedSavingsCents,
    actual: (audit) => audit.actualSavingsCents
  }
];

export function analyzeRealityAdjustment(
  plan: PlanDocument,
  projection: ProjectionResult
): RealityAdjustmentResult {
  const summaryById = new Map(
    projection.periodSummaries.map((summary) => [summary.periodId, summary])
  );
  const auditedPeriods = plan.periods
    .map((period) => ({
      audit: period.audit,
      summary: summaryById.get(period.id)
    }))
    .filter(
      (
        item
      ): item is {
        audit: NonNullable<PlanDocument["periods"][number]["audit"]>;
        summary: ProjectionResult["periodSummaries"][number];
      } => Boolean(item.audit?.completedAt && item.summary)
    );

  const metrics = metricDefinitions.map((definition) => {
    const plannedCents = auditedPeriods.reduce(
      (total, item) => total + definition.planned(item.summary),
      0
    );
    const actualCents = auditedPeriods.reduce(
      (total, item) => total + definition.actual(item.audit),
      0
    );
    const deltaCents = actualCents - plannedCents;
    const impactCents =
      definition.role === "outflow" ? plannedCents - actualCents : deltaCents;

    return {
      key: definition.key,
      label: definition.label,
      plannedCents,
      actualCents,
      deltaCents,
      impactCents,
      ratio: plannedCents > 0 ? actualCents / plannedCents : null,
      role: definition.role
    };
  });
  const months = projectRealityAdjustedMonths(projection.months, metrics);
  const goalImpacts = calculateGoalImpacts(projection.goalResults, months);
  const biggestDrifts = [...metrics]
    .filter(
      (metric) =>
        metric.plannedCents > 0 ||
        metric.actualCents > 0 ||
        Math.abs(metric.impactCents) > 0
    )
    .sort(
      (a, b) =>
        Math.abs(b.impactCents) - Math.abs(a.impactCents) ||
        a.label.localeCompare(b.label)
    );

  return {
    auditCount: auditedPeriods.length,
    hasAuditSignal: auditedPeriods.length > 0,
    metrics,
    biggestDrifts,
    months,
    goalImpacts
  };
}

function projectRealityAdjustedMonths(
  months: ProjectionMonth[],
  metrics: RealityDriftMetric[]
): RealityAdjustedMonth[] {
  const ratios = new Map(
    metrics.map((metric) => [metric.key, metric.ratio ?? 1])
  );
  const firstMonth = months[0];
  let spendableBalance = firstMonth?.openingSpendableCents ?? 0;
  let savingsBalance = firstMonth?.openingSavingsCents ?? 0;
  let cumulativeTaxCents = 0;

  return months.map((month) => {
    const adjustedGrossIncomeCents = scaleCents(
      month.grossIncomeCents,
      ratios.get("grossIncome") ?? 1
    );
    const adjustedTaxCents = Math.min(
      adjustedGrossIncomeCents,
      scaleCents(month.taxCents, ratios.get("taxes") ?? 1)
    );
    const adjustedAfterTaxIncomeCents =
      adjustedGrossIncomeCents - adjustedTaxCents;
    const adjustedCostOfLivingCents = scaleCents(
      month.costOfLivingCents,
      ratios.get("costOfLiving") ?? 1
    );
    const adjustedExtraExpenseCents = scaleCents(
      month.extraExpenseCents,
      ratios.get("extraExpenses") ?? 1
    );
    const adjustedCharityCents = scaleCents(
      month.charityCents,
      ratios.get("charity") ?? 1
    );
    const adjustedSavingsCents = scaleCents(
      month.plannedSavingsCents,
      ratios.get("savings") ?? 1
    );
    const adjustedNetSpendableChangeCents =
      adjustedAfterTaxIncomeCents -
      adjustedCharityCents -
      adjustedSavingsCents -
      adjustedCostOfLivingCents -
      adjustedExtraExpenseCents;

    spendableBalance += adjustedNetSpendableChangeCents;
    savingsBalance += adjustedSavingsCents;
    cumulativeTaxCents += adjustedTaxCents;

    const plannedNetWorthCents =
      month.closingSpendableCents + month.closingSavingsCents;
    const adjustedNetWorthCents = spendableBalance + savingsBalance;

    return {
      month: month.month,
      label: month.label,
      plannedNetWorthCents,
      adjustedSpendableCents: spendableBalance,
      adjustedSavingsCents: savingsBalance,
      adjustedNetWorthCents,
      adjustedCumulativeTaxCents: cumulativeTaxCents,
      netWorthDeltaCents: adjustedNetWorthCents - plannedNetWorthCents
    };
  });
}

function calculateGoalImpacts(
  goalResults: GoalResult[],
  months: RealityAdjustedMonth[]
): RealityGoalImpact[] {
  const monthByKey = new Map(months.map((month) => [month.month, month]));

  return goalResults
    .map((result) => {
      const targetMonth =
        monthByKey.get(result.targetMonth) ?? months.at(-1) ?? null;
      const adjustedTarget = months.find(
        (month) =>
          calculateAdjustedAvailableCash(
            month,
            result.contributedFromSavingsCents
          ) >= result.requiredCashCents
      );
      const adjustedAvailableCents = targetMonth
        ? calculateAdjustedAvailableCash(
            targetMonth,
            result.contributedFromSavingsCents
          )
        : 0;
      const adjustedTargetMonth = adjustedTarget?.month ?? null;

      return {
        goalId: result.goalId,
        goalName: result.goalName,
        scenarioId: result.scenarioId,
        scenarioName: result.scenarioName,
        plannedTargetMonth: result.targetMonth,
        plannedTargetLabel: targetMonth?.label ?? result.targetMonth,
        adjustedTargetMonth,
        adjustedTargetLabel: adjustedTarget?.label ?? null,
        monthDelta: adjustedTargetMonth
          ? diffMonthKeys(result.targetMonth, adjustedTargetMonth)
          : null,
        plannedAvailableCents: result.availableCashCents,
        adjustedAvailableCents,
        requiredCashCents: result.requiredCashCents
      };
    })
    .sort((a, b) => {
      const aDelay = a.monthDelta === null ? 9999 : Math.abs(a.monthDelta);
      const bDelay = b.monthDelta === null ? 9999 : Math.abs(b.monthDelta);
      return (
        bDelay - aDelay ||
        Math.abs(b.adjustedAvailableCents - b.plannedAvailableCents) -
          Math.abs(a.adjustedAvailableCents - a.plannedAvailableCents)
      );
    });
}

function calculateAdjustedAvailableCash(
  month: RealityAdjustedMonth,
  contributedFromSavingsCents: MoneyCents
): MoneyCents {
  // Mirror the projection: a goal is funded by spendable cash plus the savings
  // it has committed. Uncommitted savings stays out of the available total.
  return month.adjustedSpendableCents + contributedFromSavingsCents;
}

function scaleCents(cents: MoneyCents, ratio: number): MoneyCents {
  if (!Number.isFinite(ratio)) {
    return cents;
  }

  return Math.max(Math.round(cents * ratio), 0);
}

function diffMonthKeys(startMonth: string, endMonth: string): number {
  const [startYear, startIndex] = startMonth.split("-").map(Number);
  const [endYear, endIndex] = endMonth.split("-").map(Number);

  return (endYear - startYear) * 12 + (endIndex - startIndex);
}
