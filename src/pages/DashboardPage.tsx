import { AlertTriangle, PiggyBank, ReceiptText, Target, Wallet } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatMoney, formatPercent } from "../domain/money";
import {
  getTodayLocalDate,
  isPeriodCurrent,
  isPeriodPast
} from "../domain/periods";
import { projectPlan } from "../domain/projection";
import { cn } from "../lib/utils";
import { usePlannerStore } from "../store/plannerStore";

type ProjectionChartDatum = {
  month: string;
  Spendable: number;
  Savings: number;
  "Net worth": number;
  Taxes: number;
  openingSpendableCents: number;
  openingSavingsCents: number;
  grossIncomeCents: number;
  taxCents: number;
  afterTaxIncomeCents: number;
  costOfLivingCents: number;
  extraExpenseCents: number;
  charityCents: number;
  plannedSavingsCents: number;
  netSpendableChangeCents: number;
  closingSpendableCents: number;
  closingSavingsCents: number;
  cumulativeTaxCents: number;
  netWorthCents: number;
  reservedGoalContributionCents: number;
  activePeriods: string;
};

type ProjectionChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: ProjectionChartDatum }>;
  label?: string | number;
};

function ProjectionChartTooltip({
  active,
  payload,
  label
}: ProjectionChartTooltipProps) {
  const datum = payload?.[0]?.payload;

  if (!active || !datum) {
    return null;
  }

  const rows = [
    { label: "Gross income", value: datum.grossIncomeCents },
    { label: "Tax", value: -datum.taxCents },
    { label: "After-tax income", value: datum.afterTaxIncomeCents },
    { label: "Cost of living", value: -datum.costOfLivingCents },
    { label: "Extra expenses", value: -datum.extraExpenseCents },
    { label: "Charity", value: -datum.charityCents },
    { label: "Planned savings", value: datum.plannedSavingsCents },
    { label: "Spendable change", value: datum.netSpendableChangeCents }
  ];

  return (
    <div className="w-[280px] rounded-md border border-border bg-card p-3 text-sm text-card-foreground shadow-soft">
      <div className="mb-3 border-b border-border pb-2">
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{datum.activePeriods}</p>
      </div>

      <div className="space-y-1.5">
        <TooltipRow label="Opening cash" value={datum.openingSpendableCents} />
        <TooltipRow label="Opening savings" value={datum.openingSavingsCents} />
      </div>

      <div className="my-3 border-t border-border" />

      <div className="space-y-1.5">
        {rows.map((row) => (
          <TooltipRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>

      <div className="my-3 border-t border-border" />

      <div className="space-y-1.5">
        <TooltipRow label="Ending cash" value={datum.closingSpendableCents} />
        <TooltipRow label="Ending savings" value={datum.closingSavingsCents} />
        {datum.reservedGoalContributionCents > 0 ? (
          <TooltipRow
            label="Reserved in savings"
            value={datum.reservedGoalContributionCents}
          />
        ) : null}
        <TooltipRow label="Cumulative taxes" value={datum.cumulativeTaxCents} />
        <TooltipRow
          className="pt-1 font-semibold"
          label="Net worth"
          value={datum.netWorthCents}
        />
      </div>
    </div>
  );
}

function TooltipRow({
  className,
  label,
  value
}: {
  className?: string;
  label: string;
  value: number;
}) {
  const displayValue = Object.is(value, -0) ? 0 : value;

  return (
    <div className={`flex items-center justify-between gap-4 ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {formatMoney(displayValue)}
      </span>
    </div>
  );
}

export function DashboardPage() {
  const plan = usePlannerStore((state) => state.plan);
  const projection = useMemo(() => (plan ? projectPlan(plan) : null), [plan]);
  const today = useMemo(() => getTodayLocalDate(), []);

  if (!plan || !projection) {
    return null;
  }

  const periodById = new Map(plan.periods.map((period) => [period.id, period]));
  const periodNameById = new Map(
    projection.periodSummaries.map((period) => [period.periodId, period.name])
  );
  const currentPeriodIds = new Set(
    plan.periods
      .filter((period) => isPeriodCurrent(period, today))
      .map((period) => period.id)
  );
  const currentPeriodNames = projection.periodSummaries
    .filter((period) => currentPeriodIds.has(period.periodId))
    .map((period) => period.name);
  const chartData = projection.months.map<ProjectionChartDatum>((month) => {
    const netWorthCents =
      month.closingSpendableCents + month.closingSavingsCents;
    const activePeriods = month.activePeriodIds
      .map((periodId) => periodNameById.get(periodId))
      .filter((periodName): periodName is string => Boolean(periodName));

    return {
      month: month.label,
      Spendable: month.closingSpendableCents / 100,
      Savings: month.closingSavingsCents / 100,
      "Net worth": netWorthCents / 100,
      Taxes: month.cumulativeTaxCents / 100,
      openingSpendableCents: month.openingSpendableCents,
      openingSavingsCents: month.openingSavingsCents,
      grossIncomeCents: month.grossIncomeCents,
      taxCents: month.taxCents,
      afterTaxIncomeCents: month.afterTaxIncomeCents,
      costOfLivingCents: month.costOfLivingCents,
      extraExpenseCents: month.extraExpenseCents,
      charityCents: month.charityCents,
      plannedSavingsCents: month.plannedSavingsCents,
      netSpendableChangeCents: month.netSpendableChangeCents,
      closingSpendableCents: month.closingSpendableCents,
      closingSavingsCents: month.closingSavingsCents,
      cumulativeTaxCents: month.cumulativeTaxCents,
      netWorthCents,
      reservedGoalContributionCents:
        projection.totals.reservedGoalContributionCents,
      activePeriods: activePeriods.length
        ? activePeriods.join(", ")
        : "No active period"
    };
  });

  const lastMonth = projection.months.at(-1);
  const firstGoal = projection.goalResults[0];

  return (
    <div>
      <PageHeader
        eyebrow={plan.name}
        title="Dashboard"
        actions={
          <div className="flex flex-wrap gap-2">
            {currentPeriodNames.length ? (
              <Badge variant="success">
                Current: {currentPeriodNames.join(", ")}
              </Badge>
            ) : null}
            <Badge variant={projection.warnings.length ? "warning" : "success"}>
              {projection.warnings.length
                ? `${projection.warnings.length} warning${projection.warnings.length === 1 ? "" : "s"}`
                : "Plan balanced"}
            </Badge>
          </div>
        }
      />

      {projection.warnings.length ? (
        <section className="mb-6 space-y-2">
          {projection.warnings.map((warning) => (
            <div
              className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              key={warning.id}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning.message}</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Projected net worth"
          value={formatMoney(projection.totals.endingNetWorthCents)}
          detail={
            lastMonth
              ? `Cash + savings through ${lastMonth.label}`
              : undefined
          }
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Savings balance"
          value={formatMoney(projection.totals.endingSavingsCents)}
          detail={`${formatMoney(projection.totals.reservedGoalContributionCents)} committed to goals`}
          icon={<PiggyBank className="h-5 w-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Cumulative taxes"
          value={formatMoney(projection.totals.cumulativeTaxCents)}
          detail={`${projection.periodSummaries.length} period${projection.periodSummaries.length === 1 ? "" : "s"}`}
          icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}
        />
        <MetricCard
          label={firstGoal ? firstGoal.goalName : "Goal status"}
          value={
            firstGoal
              ? formatPercent(Math.round(firstGoal.percentFunded))
              : "No goals"
          }
          detail={firstGoal ? firstGoal.scenarioName : "Create one in Goals"}
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Projection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[340px] w-full">
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ left: 0, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" minTickGap={32} />
                  <YAxis tickFormatter={(value) => `$${Number(value) / 1000}k`} />
                  <Tooltip
                    content={<ProjectionChartTooltip />}
                    cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
                    isAnimationActive={false}
                    wrapperStyle={{ outline: "none", zIndex: 50 }}
                  />
                  <Legend />
                  <Area
                    dataKey="Net worth"
                    fill="#0f766e"
                    fillOpacity={0.18}
                    stroke="#0f766e"
                    strokeWidth={2}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    dataKey="Savings"
                    fill="#2563eb"
                    fillOpacity={0.14}
                    stroke="#2563eb"
                    strokeWidth={2}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    dataKey="Taxes"
                    fill="#f59e0b"
                    fillOpacity={0.12}
                    stroke="#d97706"
                    strokeWidth={2}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Goal Feasibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {projection.goalResults.map((result) => (
              <div
                className="rounded-md border border-border bg-background p-4"
                key={`${result.goalId}-${result.scenarioId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{result.goalName}</p>
                    <p className="text-sm text-muted-foreground">
                      {result.scenarioName} by {result.targetDate}
                    </p>
                  </div>
                  <Badge
                    variant={
                      result.surplusOrShortfallCents >= 0 ? "success" : "danger"
                    }
                  >
                    {formatPercent(Math.round(result.percentFunded))}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Required</p>
                    <p className="font-semibold">
                      {formatMoney(result.requiredCashCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Available</p>
                    <p className="font-semibold">
                      {formatMoney(result.availableCashCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Contributed</p>
                    <p className="font-semibold">
                      {formatMoney(result.contributedFromSavingsCents)}
                    </p>
                  </div>
                  {result.availableDownPaymentCents !== undefined ? (
                    <div>
                      <p className="text-muted-foreground">Down payment</p>
                      <p className="font-semibold">
                        {formatMoney(result.availableDownPaymentCents)}
                      </p>
                      {result.availableDownPaymentPercent !== undefined ? (
                        <p className="text-muted-foreground">
                          {formatPercent(result.availableDownPaymentPercent)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div>
                    <p className="text-muted-foreground">Delta</p>
                    <p className="font-semibold">
                      {formatMoney(result.surplusOrShortfallCents)}
                    </p>
                  </div>
                  {result.estimatedMonthlyPaymentCents ? (
                    <div>
                      <p className="text-muted-foreground">Payment</p>
                      <p className="font-semibold">
                        {formatMoney(result.estimatedMonthlyPaymentCents)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projection.periodSummaries.map((period) => {
              const sourcePeriod = periodById.get(period.periodId);
              const current = currentPeriodIds.has(period.periodId);
              const auditCompleted = Boolean(sourcePeriod?.audit?.completedAt);
              const auditReady = sourcePeriod
                ? isPeriodPast(sourcePeriod, today) && !auditCompleted
                : false;

              return (
                <div
                  className={cn(
                    "grid gap-3 rounded-md border border-border bg-background p-4 sm:grid-cols-5",
                    current && "border-emerald-300 bg-emerald-50/70"
                  )}
                  key={period.periodId}
                >
                  <div className="sm:col-span-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{period.name}</p>
                      {current ? <Badge variant="success">Current</Badge> : null}
                      {auditCompleted ? (
                        <Badge variant="success">Audited</Badge>
                      ) : auditReady ? (
                        <Badge variant="warning">Audit ready</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {period.startDate} to {period.endDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Taxes</p>
                    <p className="font-semibold">
                      {formatMoney(period.taxCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Profit</p>
                    <p className="font-semibold">
                      {formatMoney(period.profitCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Savings end</p>
                    <p className="font-semibold">
                      {formatMoney(period.savingsEndingCents)}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Projection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Gross</th>
                    <th className="px-3 py-2 font-medium">Tax</th>
                    <th className="px-3 py-2 font-medium">COL</th>
                    <th className="px-3 py-2 font-medium">Savings</th>
                    <th className="px-3 py-2 font-medium">Spendable</th>
                    <th className="px-3 py-2 font-medium">Saved</th>
                    <th className="px-3 py-2 font-medium">Net worth</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.months.map((month) => {
                    const netWorthCents =
                      month.closingSpendableCents + month.closingSavingsCents;

                    return (
                      <tr className="border-t border-border" key={month.month}>
                        <td className="px-3 py-2 font-medium">{month.label}</td>
                        <td className="px-3 py-2">
                          {formatMoney(month.grossIncomeCents, {
                            compact: true
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(month.taxCents, { compact: true })}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(month.costOfLivingCents, {
                            compact: true
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(month.plannedSavingsCents, {
                            compact: true
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(month.closingSpendableCents, {
                            compact: true
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(month.closingSavingsCents, {
                            compact: true
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(netWorthCents, { compact: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
