import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
  parseISO,
  startOfMonth
} from "date-fns";
import { calculatePeriodTaxProfile } from "./tax";
import type {
  CostOfLivingScenario,
  FinancialPeriod,
  Goal,
  GoalResult,
  GoalScenario,
  GoalType,
  HouseAmortization,
  HouseGoalFields,
  MoneyCents,
  PeriodSummary,
  PlanDocument,
  ProjectionMonth,
  ProjectionResult,
  ProjectionWarning,
  RecurringMoneyItem
} from "./types";

type Contribution = {
  grossIncomeCents: MoneyCents;
  taxCents: MoneyCents;
  afterTaxIncomeCents: MoneyCents;
  costOfLivingCents: MoneyCents;
  extraExpenseCents: MoneyCents;
  charityCents: MoneyCents;
  plannedSavingsCents: MoneyCents;
  netSpendableChangeCents: MoneyCents;
};

type TaxProfile = ReturnType<typeof calculatePeriodTaxProfile>;

const emptyContribution = (): Contribution => ({
  grossIncomeCents: 0,
  taxCents: 0,
  afterTaxIncomeCents: 0,
  costOfLivingCents: 0,
  extraExpenseCents: 0,
  charityCents: 0,
  plannedSavingsCents: 0,
  netSpendableChangeCents: 0
});

export function projectPlan(plan: PlanDocument): ProjectionResult {
  const warnings: ProjectionWarning[] = [];
  const periods = [...plan.periods].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const colScenarios = new Map(
    plan.costOfLivingScenarios.map((scenario) => [scenario.id, scenario])
  );
  const taxProfiles = new Map(
    periods.map((period) => [period.id, calculatePeriodTaxProfile(period)])
  );
  const periodSummaries = createPeriodSummaries(periods, taxProfiles);

  warnings.push(...validatePeriodTimeline(periods));
  warnings.push(...validateScenarioReferences(periods, colScenarios));

  const months = buildProjectionMonths(plan, periods);
  const reservedGoalContributionCents = sumGoalContributions(plan.goals);
  let spendableBalance = plan.startingSpendableCents;
  let savingsBalance = plan.startingSavingsCents;
  let cumulativeTaxCents = 0;
  const projectedMonths: ProjectionMonth[] = [];

  if (reservedGoalContributionCents > plan.startingSavingsCents) {
    warnings.push({
      id: "goal-contribution-over-savings",
      severity: "warning",
      message:
        "Goal contributions from savings are greater than the starting savings balance."
    });
  }

  for (const monthDate of months) {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthKey = format(monthDate, "yyyy-MM");
    const openingSpendableCents = spendableBalance;
    const openingSavingsCents = savingsBalance;
    const activePeriods = periods.filter((period) =>
      periodOverlapsRange(period, monthStart, monthEnd)
    );
    const monthContribution = emptyContribution();

    for (const period of activePeriods) {
      const scenario = colScenarios.get(period.costOfLivingScenarioId);
      const contribution = calculatePeriodMonthContribution(
        period,
        scenario,
        taxProfiles.get(period.id) ?? calculatePeriodTaxProfile(period),
        monthStart,
        monthEnd
      );
      const summary = periodSummaries.get(period.id);
      if (summary && Number.isNaN(summary.carryoverInCents)) {
        summary.carryoverInCents = spendableBalance;
      }

      addContribution(monthContribution, contribution);
      addContribution(summary, contribution);

      spendableBalance += contribution.netSpendableChangeCents;
      savingsBalance += contribution.plannedSavingsCents;

      if (summary) {
        summary.profitCents += calculateProfitCents(contribution);
        summary.spendableEndingCents = spendableBalance;
        summary.savingsEndingCents = savingsBalance;
      }
    }

    cumulativeTaxCents += monthContribution.taxCents;
    const row: ProjectionMonth = {
      month: monthKey,
      label: format(monthDate, "MMM yyyy"),
      openingSpendableCents,
      openingSavingsCents,
      ...monthContribution,
      closingSpendableCents: spendableBalance,
      closingSavingsCents: savingsBalance,
      cumulativeTaxCents,
      activePeriodIds: activePeriods.map((period) => period.id)
    };

    if (row.closingSpendableCents < 0) {
      warnings.push({
        id: `negative-${row.month}`,
        severity: "warning",
        message: `${row.label} ends with negative spendable cash.`
      });
    }

    projectedMonths.push(row);
  }

  const goalResults = calculateGoalResults(
    plan.goals,
    projectedMonths,
    reservedGoalContributionCents
  );
  for (const result of goalResults) {
    if (result.surplusOrShortfallCents < 0) {
      warnings.push({
        id: `goal-shortfall-${result.goalId}-${result.scenarioId}`,
        severity: "warning",
        message: `${result.goalName} / ${result.scenarioName} is short by ${Math.abs(
          result.surplusOrShortfallCents / 100
        ).toLocaleString("en-US", {
          style: "currency",
          currency: "USD"
        })}.`
      });
    }
  }

  const lastMonth = projectedMonths.at(-1);
  const endingSpendableCents =
    lastMonth?.closingSpendableCents ?? plan.startingSpendableCents;
  const endingSavingsCents =
    lastMonth?.closingSavingsCents ?? plan.startingSavingsCents;
  const endingNetWorthCents =
    endingSpendableCents + endingSavingsCents;

  return {
    months: projectedMonths,
    periodSummaries: [...periodSummaries.values()].map((summary) => ({
      ...summary,
      carryoverInCents:
        Number.isNaN(summary.carryoverInCents) ? 0 : summary.carryoverInCents
    })),
    goalResults,
    warnings,
    totals: {
      cumulativeTaxCents,
      endingSpendableCents,
      endingSavingsCents,
      reservedGoalContributionCents,
      endingAvailableCents: endingNetWorthCents,
      endingNetWorthCents
    }
  };
}

export function normalizedMonthlyCents(
  amountCents: MoneyCents,
  cadence: "monthly" | "yearly" | "weekly"
): MoneyCents {
  if (cadence === "yearly") {
    return Math.round(amountCents / 12);
  }
  if (cadence === "weekly") {
    return Math.round((amountCents * 52) / 12);
  }
  return amountCents;
}

export function estimateHousePaymentCents(fields: HouseGoalFields): MoneyCents {
  return calculateHouseAmortization(fields).totalMonthlyPaymentCents;
}

export function calculateHouseAmortization(
  fields: HouseGoalFields
): HouseAmortization {
  const downPaymentCents = Math.round(
    fields.purchasePriceCents * (fields.downPaymentPercent / 100)
  );
  const loanPrincipalCents = Math.max(
    fields.purchasePriceCents - downPaymentCents,
    0
  );
  const payments = Math.max(fields.loanTermYears * 12, 1);
  const monthlyRate = fields.interestRatePercent / 100 / 12;
  const monthlyPrincipalInterestCents =
    loanPrincipalCents === 0
      ? 0
      : Math.round(
          monthlyRate === 0
            ? loanPrincipalCents / payments
            : (loanPrincipalCents *
                monthlyRate *
                Math.pow(1 + monthlyRate, payments)) /
                (Math.pow(1 + monthlyRate, payments) - 1)
        );
  const monthlyPropertyTaxCents = Math.round(
    (fields.purchasePriceCents * (fields.annualPropertyTaxPercent / 100)) / 12
  );
  const schedule: HouseAmortization["schedule"] = [];
  let remainingPrincipalCents = loanPrincipalCents;

  for (
    let monthNumber = 1;
    monthNumber <= payments && remainingPrincipalCents > 0;
    monthNumber += 1
  ) {
    const interestCents = Math.round(remainingPrincipalCents * monthlyRate);
    let principalCents = Math.min(
      remainingPrincipalCents,
      Math.max(monthlyPrincipalInterestCents - interestCents, 0)
    );

    if (monthNumber === payments && principalCents < remainingPrincipalCents) {
      principalCents = remainingPrincipalCents;
    }

    remainingPrincipalCents -= principalCents;
    schedule.push({
      monthNumber,
      paymentCents: principalCents + interestCents,
      principalCents,
      interestCents,
      remainingPrincipalCents
    });
  }

  const totalPrincipalCents = schedule.reduce(
    (total, row) => total + row.principalCents,
    0
  );
  const totalInterestCents = schedule.reduce(
    (total, row) => total + row.interestCents,
    0
  );
  const firstYearRows = schedule.slice(0, 12);

  return {
    loanPrincipalCents,
    monthlyPrincipalInterestCents,
    monthlyPropertyTaxCents,
    monthlyInsuranceCents: fields.monthlyInsuranceCents,
    monthlyHoaCents: fields.monthlyHoaCents,
    totalMonthlyPaymentCents:
      monthlyPrincipalInterestCents +
      monthlyPropertyTaxCents +
      fields.monthlyInsuranceCents +
      fields.monthlyHoaCents,
    totalPrincipalCents,
    totalInterestCents,
    totalPrincipalInterestCents: totalPrincipalCents + totalInterestCents,
    firstYearPrincipalCents: firstYearRows.reduce(
      (total, row) => total + row.principalCents,
      0
    ),
    firstYearInterestCents: firstYearRows.reduce(
      (total, row) => total + row.interestCents,
      0
    ),
    payoffMonths: schedule.length,
    schedule
  };
}

export function requiredCashForGoalScenario(
  scenario: GoalScenario
): MoneyCents {
  if (getGoalScenarioType(scenario) !== "house" || !scenario.house) {
    return scenario.targetAmountCents;
  }
  const houseCash = Math.round(
    scenario.house.purchasePriceCents *
      ((scenario.house.downPaymentPercent + scenario.house.closingCostPercent) /
        100)
  );
  return Math.max(scenario.targetAmountCents, houseCash);
}

export function getGoalScenarioType(scenario: GoalScenario): GoalType {
  return scenario.type ?? (scenario.house ? "house" : "other");
}

function calculatePeriodMonthContribution(
  period: FinancialPeriod,
  scenario: CostOfLivingScenario | undefined,
  taxProfile: TaxProfile,
  monthStart: Date,
  monthEnd: Date
): Contribution {
  const ratio = activeDayRatio(period, monthStart, monthEnd);
  const grossIncomeCents = sumPeriodItems(
    period.grossIncomeItems,
    period,
    monthStart,
    monthEnd,
    ratio
  );
  const taxCents = Math.round(
    grossIncomeCents * (taxProfile.calculatedTaxRate / 100)
  );
  const afterTaxIncomeCents = grossIncomeCents - taxCents;
  const costOfLivingCents = scenario
    ? scenario.items.reduce((total, item) => {
        if (item.enabled === false) {
          return total;
        }
        const monthlyAmount = normalizedMonthlyCents(
          item.amountCents,
          item.cadence
        );
        return total + Math.round(monthlyAmount * ratio);
      }, 0)
    : 0;
  const extraExpenseCents = sumPeriodItems(
    period.extraExpenseItems,
    period,
    monthStart,
    monthEnd,
    ratio
  );
  const charityCents = Math.round(afterTaxIncomeCents * (period.charityRate / 100));
  const plannedSavingsCents = Math.round(
    afterTaxIncomeCents * (period.savingsRate / 100)
  );

  return {
    grossIncomeCents,
    taxCents,
    afterTaxIncomeCents,
    costOfLivingCents,
    extraExpenseCents,
    charityCents,
    plannedSavingsCents,
    netSpendableChangeCents:
      afterTaxIncomeCents -
      charityCents -
      plannedSavingsCents -
      costOfLivingCents -
      extraExpenseCents
  };
}

function sumPeriodItems(
  items: RecurringMoneyItem[],
  period: FinancialPeriod,
  monthStart: Date,
  monthEnd: Date,
  ratio: number
): MoneyCents {
  return items.reduce((total, item) => {
    if (item.enabled === false) {
      return total;
    }
    if (item.cadence === "oneTime") {
      if (!item.date) {
        return total;
      }
      const itemDate = parseISO(item.date);
      const applies =
        isWithinInterval(itemDate, { start: monthStart, end: monthEnd }) &&
        isWithinInterval(itemDate, {
          start: parseISO(period.startDate),
          end: parseISO(period.endDate)
        });
      return applies ? total + item.amountCents : total;
    }

    return (
      total +
      Math.round(normalizedMonthlyCents(item.amountCents, item.cadence) * ratio)
    );
  }, 0);
}

function addContribution(
  target: Partial<Contribution> | undefined,
  contribution: Contribution
) {
  if (!target) {
    return;
  }
  target.grossIncomeCents =
    (target.grossIncomeCents ?? 0) + contribution.grossIncomeCents;
  target.taxCents = (target.taxCents ?? 0) + contribution.taxCents;
  target.afterTaxIncomeCents =
    (target.afterTaxIncomeCents ?? 0) + contribution.afterTaxIncomeCents;
  target.costOfLivingCents =
    (target.costOfLivingCents ?? 0) + contribution.costOfLivingCents;
  target.extraExpenseCents =
    (target.extraExpenseCents ?? 0) + contribution.extraExpenseCents;
  target.charityCents = (target.charityCents ?? 0) + contribution.charityCents;
  target.plannedSavingsCents =
    (target.plannedSavingsCents ?? 0) + contribution.plannedSavingsCents;
  target.netSpendableChangeCents =
    (target.netSpendableChangeCents ?? 0) +
    contribution.netSpendableChangeCents;
}

function calculateProfitCents(contribution: Contribution): MoneyCents {
  return contribution.netSpendableChangeCents + contribution.plannedSavingsCents;
}

function calculateGoalResults(
  goals: Goal[],
  months: ProjectionMonth[],
  reservedGoalContributionCents: MoneyCents
): GoalResult[] {
  return goals.flatMap((goal) =>
    goal.scenarios.map((scenario) => {
      const scenarioType = getGoalScenarioType(scenario);
      const houseFields =
        scenarioType === "house" ? scenario.house : undefined;
      const targetMonth = scenario.targetDate.slice(0, 7);
      const row =
        months.find((month) => month.month === targetMonth) ?? months.at(-1);
      const contributedFromSavingsCents =
        goal.contributedFromSavingsCents ?? 0;
      const closingSpendableCents = row?.closingSpendableCents ?? 0;
      const closingSavingsCents = row?.closingSavingsCents ?? 0;
      const unallocatedAvailableCashCents =
        closingSpendableCents +
        Math.max(closingSavingsCents - reservedGoalContributionCents, 0);
      const availableCashCents =
        unallocatedAvailableCashCents + contributedFromSavingsCents;
      const requiredCashCents = requiredCashForGoalScenario(scenario);
      const surplusOrShortfallCents = availableCashCents - requiredCashCents;
      const houseCash = houseFields
        ? calculateHouseCashAvailability(houseFields, availableCashCents)
        : {};

      return {
        goalId: goal.id,
        goalName: goal.name,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        targetMonth,
        targetDate: scenario.targetDate,
        requiredCashCents,
        contributedFromSavingsCents,
        unallocatedAvailableCashCents,
        availableCashCents,
        surplusOrShortfallCents,
        percentFunded:
          requiredCashCents === 0
            ? 100
            : Math.min((availableCashCents / requiredCashCents) * 100, 999),
        ...houseCash,
        estimatedMonthlyPaymentCents: houseFields
          ? estimateHousePaymentCents(houseFields)
          : undefined
      };
    })
  );
}

function calculateHouseCashAvailability(
  fields: HouseGoalFields,
  availableCashCents: MoneyCents
): Pick<
  GoalResult,
  | "availableDownPaymentCents"
  | "availableDownPaymentPercent"
  | "requiredClosingCostCents"
  | "requiredDownPaymentCents"
> {
  const requiredDownPaymentCents = Math.round(
    fields.purchasePriceCents * (fields.downPaymentPercent / 100)
  );
  const requiredClosingCostCents = Math.round(
    fields.purchasePriceCents * (fields.closingCostPercent / 100)
  );
  const availableDownPaymentCents = Math.min(
    fields.purchasePriceCents,
    Math.max(0, availableCashCents - requiredClosingCostCents)
  );
  const availableDownPaymentPercent =
    fields.purchasePriceCents === 0
      ? 0
      : (availableDownPaymentCents / fields.purchasePriceCents) * 100;

  return {
    availableDownPaymentCents,
    availableDownPaymentPercent,
    requiredClosingCostCents,
    requiredDownPaymentCents
  };
}

function sumGoalContributions(goals: Goal[]): MoneyCents {
  return goals.reduce(
    (total, goal) => total + (goal.contributedFromSavingsCents ?? 0),
    0
  );
}

function buildProjectionMonths(
  plan: PlanDocument,
  periods: FinancialPeriod[]
): Date[] {
  const periodStarts = periods.map((period) => parseISO(period.startDate));
  const periodEnds = periods.map((period) => parseISO(period.endDate));
  const goalDates = plan.goals.flatMap((goal) =>
    goal.scenarios.map((scenario) => parseISO(scenario.targetDate))
  );
  const startCandidates = periodStarts.length > 0 ? periodStarts : [new Date()];
  const endCandidates = [...periodEnds, ...goalDates, ...startCandidates];
  const start = startOfMonth(earliestDate(startCandidates));
  const end = endOfMonth(latestDate(endCandidates));

  return eachMonthOfInterval({ start, end });
}

function createPeriodSummaries(
  periods: FinancialPeriod[],
  taxProfiles: Map<string, TaxProfile>
): Map<string, PeriodSummary> {
  return new Map(
    periods.map((period) => {
      const taxProfile = taxProfiles.get(period.id) ?? calculatePeriodTaxProfile(period);

      return [
        period.id,
        {
        periodId: period.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        carryoverInCents: Number.NaN,
        calculatedTaxRate: taxProfile.calculatedTaxRate,
        annualizedGrossIncomeCents: taxProfile.annualizedGrossIncomeCents,
        grossIncomeCents: 0,
        taxCents: 0,
        afterTaxIncomeCents: 0,
        costOfLivingCents: 0,
        extraExpenseCents: 0,
        charityCents: 0,
        plannedSavingsCents: 0,
        profitCents: 0,
        spendableEndingCents: 0,
        savingsEndingCents: 0
      }
      ];
    })
  );
}

function validatePeriodTimeline(
  periods: FinancialPeriod[]
): ProjectionWarning[] {
  const warnings: ProjectionWarning[] = [];
  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];
    const previousEnd = parseISO(previous.endDate);
    const currentStart = parseISO(current.startDate);

    if (!isAfter(currentStart, previousEnd)) {
      warnings.push({
        id: `overlap-${previous.id}-${current.id}`,
        severity: "error",
        message: `${current.name} overlaps ${previous.name}.`
      });
      continue;
    }

    if (isAfter(currentStart, addDays(previousEnd, 1))) {
      warnings.push({
        id: `gap-${previous.id}-${current.id}`,
        severity: "info",
        message: `There is a gap between ${previous.name} and ${current.name}. Balances carry forward with no new period assumptions.`
      });
    }
  }
  return warnings;
}

function validateScenarioReferences(
  periods: FinancialPeriod[],
  colScenarios: Map<string, CostOfLivingScenario>
): ProjectionWarning[] {
  return periods
    .filter((period) => !colScenarios.has(period.costOfLivingScenarioId))
    .map((period) => ({
      id: `missing-col-${period.id}`,
      severity: "error" as const,
      message: `${period.name} references a missing cost-of-living scenario.`
    }));
}

function activeDayRatio(
  period: FinancialPeriod,
  monthStart: Date,
  monthEnd: Date
): number {
  const periodStart = parseISO(period.startDate);
  const periodEnd = parseISO(period.endDate);
  const overlapStart = latestDate([periodStart, monthStart]);
  const overlapEnd = earliestDate([periodEnd, monthEnd]);

  if (isBefore(overlapEnd, overlapStart)) {
    return 0;
  }

  const activeDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
  const daysInMonth = differenceInCalendarDays(monthEnd, monthStart) + 1;
  return activeDays / daysInMonth;
}

function periodOverlapsRange(
  period: FinancialPeriod,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const periodStart = parseISO(period.startDate);
  const periodEnd = parseISO(period.endDate);
  return !isAfter(periodStart, rangeEnd) && !isBefore(periodEnd, rangeStart);
}

function earliestDate(dates: Date[]): Date {
  return dates.reduce((earliest, date) =>
    isBefore(date, earliest) ? date : earliest
  );
}

function latestDate(dates: Date[]): Date {
  return dates.reduce((latest, date) => (isAfter(date, latest) ? date : latest));
}
