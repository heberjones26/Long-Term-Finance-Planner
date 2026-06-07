import {
  AlertTriangle,
  Banknote,
  FlaskConical,
  PiggyBank,
  RotateCcw,
  Save,
  Wallet
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { MetricCard } from "../components/MetricCard";
import { MoneyInput } from "../components/MoneyInput";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Select } from "../components/ui/field";
import { formatMoney } from "../domain/money";
import { projectPlan } from "../domain/projection";
import type {
  GoalResult,
  GoalScenario,
  HouseGoalFields,
  PlanDocument,
  ProjectionResult,
  ProjectionWarning
} from "../domain/types";
import {
  applyWhatIfInputs,
  createWhatIfComparison,
  defaultWhatIfInputs,
  type WhatIfInputs
} from "../domain/whatIf";
import { usePlannerStore } from "../store/plannerStore";

type ProjectionComparisonDatum = {
  month: string;
  Baseline: number | null;
  "What-if": number | null;
};

export function WhatIfPage() {
  const { plan, updatePlan } = usePlannerStore();
  const [inputs, setInputs] = useState<WhatIfInputs>(() =>
    plan ? createInitialInputs(plan) : defaultWhatIfInputs
  );
  const [applyModalOpen, setApplyModalOpen] = useState(false);

  useEffect(() => {
    if (plan) {
      setInputs((current) => normalizeInputsForPlan(current, plan));
    }
  }, [plan]);

  const sortedPeriods = useMemo(
    () =>
      plan
        ? [...plan.periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
        : [],
    [plan]
  );
  const selectedPeriod = sortedPeriods.find(
    (period) => period.id === inputs.selectedPeriodId
  );
  const selectedGoal = plan?.goals.find(
    (goal) => goal.id === inputs.selectedGoalId
  );
  const selectedScenario = selectedGoal?.scenarios.find(
    (scenario) => scenario.id === inputs.selectedScenarioId
  );
  const selectedHouseFields =
    selectedScenario && isHouseScenario(selectedScenario)
      ? selectedScenario.house
      : undefined;
  const housePreview = selectedHouseFields
    ? { ...selectedHouseFields, ...inputs.house }
    : undefined;

  const baseProjection = useMemo(
    () => (plan ? projectPlan(plan) : null),
    [plan]
  );
  const whatIfPlan = useMemo(
    () => (plan ? applyWhatIfInputs(plan, inputs) : null),
    [inputs, plan]
  );
  const whatIfProjection = useMemo(
    () => (whatIfPlan ? projectPlan(whatIfPlan) : null),
    [whatIfPlan]
  );
  const comparison = useMemo(
    () =>
      baseProjection && whatIfProjection
        ? createWhatIfComparison({
            baseProjection,
            whatIfProjection,
            selectedGoalId: inputs.selectedGoalId,
            selectedScenarioId: inputs.selectedScenarioId
          })
        : null,
    [baseProjection, inputs.selectedGoalId, inputs.selectedScenarioId, whatIfProjection]
  );
  const chartData = useMemo(
    () =>
      baseProjection && whatIfProjection
        ? createProjectionComparisonData(baseProjection, whatIfProjection)
        : [],
    [baseProjection, whatIfProjection]
  );
  const changeCount = getWhatIfChangeCount(inputs, selectedScenario);
  const hasChanges = changeCount > 0;

  if (!plan || !baseProjection || !whatIfProjection || !comparison) {
    return null;
  }

  const updateInput = (updates: Partial<WhatIfInputs>) => {
    setInputs((current) => ({ ...current, ...updates }));
  };

  function updateHouseField<K extends keyof HouseGoalFields>(
    key: K,
    value: HouseGoalFields[K]
  ) {
    setInputs((current) => ({
      ...current,
      house: {
        ...current.house,
        [key]: value
      }
    }));
  }

  const resetInputs = () => setInputs(createInitialInputs(plan));

  const confirmApply = () => {
    const appliedPlan = applyWhatIfInputs(plan, inputs);
    void updatePlan((draft) => applyWhatIfInputs(draft, inputs));
    setInputs(createInitialInputs(appliedPlan));
    setApplyModalOpen(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow={plan.name}
        title="What-If Lab"
        actions={
          <>
            {hasChanges ? (
              <Badge variant="warning">
                {changeCount} edit{changeCount === 1 ? "" : "s"}
              </Badge>
            ) : (
              <Badge variant="muted">Baseline</Badge>
            )}
            <Button onClick={resetInputs} type="button" variant="outline">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            <Button
              disabled={!hasChanges}
              onClick={() => setApplyModalOpen(true)}
              type="button"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Apply to Plan
            </Button>
          </>
        }
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4">
              <Field label="Income multiplier">
                <Input
                  min="0"
                  step="1"
                  type="number"
                  value={Math.round(inputs.incomeMultiplier * 100)}
                  onChange={(event) =>
                    updateInput({
                      incomeMultiplier: readNumber(event.target.value, 100) / 100
                    })
                  }
                />
              </Field>
              <Field label="Savings rate adjustment">
                <Input
                  max="100"
                  min="-100"
                  step="1"
                  type="number"
                  value={inputs.savingsRateDelta}
                  onChange={(event) =>
                    updateInput({
                      savingsRateDelta: readNumber(event.target.value, 0)
                    })
                  }
                />
              </Field>
              <Field label="Cost of living override">
                <Select
                  value={inputs.costOfLivingScenarioId ?? ""}
                  onChange={(event) =>
                    updateInput({
                      costOfLivingScenarioId: event.target.value || undefined
                    })
                  }
                >
                  <option value="">Keep existing</option>
                  {plan.costOfLivingScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="border-t border-border pt-5">
              <div className="grid gap-4">
                <Field label="Expense period">
                  <Select
                    disabled={!sortedPeriods.length}
                    value={inputs.selectedPeriodId ?? ""}
                    onChange={(event) =>
                      updateInput({ selectedPeriodId: event.target.value })
                    }
                  >
                    {sortedPeriods.length ? null : (
                      <option value="">No periods</option>
                    )}
                    {sortedPeriods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="One-time expense">
                  <MoneyInput
                    disabled={!selectedPeriod}
                    valueCents={inputs.oneTimeExpenseCents}
                    onChange={(value) =>
                      updateInput({ oneTimeExpenseCents: Math.max(value, 0) })
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <div className="grid gap-4">
                <Field label="Goal">
                  <Select
                    disabled={!plan.goals.length}
                    value={inputs.selectedGoalId ?? ""}
                    onChange={(event) => {
                      const goal = plan.goals.find(
                        (item) => item.id === event.target.value
                      );
                      const scenario = goal?.scenarios[0];
                      updateInput({
                        selectedGoalId: goal?.id,
                        selectedScenarioId: scenario?.id,
                        goalTargetDate: scenario?.targetDate,
                        house: undefined
                      });
                    }}
                  >
                    {plan.goals.length ? null : <option value="">No goals</option>}
                    {plan.goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Scenario">
                  <Select
                    disabled={!selectedGoal}
                    value={inputs.selectedScenarioId ?? ""}
                    onChange={(event) => {
                      const scenario = selectedGoal?.scenarios.find(
                        (item) => item.id === event.target.value
                      );
                      updateInput({
                        selectedScenarioId: scenario?.id,
                        goalTargetDate: scenario?.targetDate,
                        house: undefined
                      });
                    }}
                  >
                    {selectedGoal ? null : <option value="">No scenarios</option>}
                    {selectedGoal?.scenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Target date">
                  <Input
                    disabled={!selectedScenario}
                    type="date"
                    value={inputs.goalTargetDate ?? ""}
                    onChange={(event) =>
                      updateInput({ goalTargetDate: event.target.value })
                    }
                  />
                </Field>
              </div>
            </div>

            {housePreview ? (
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <CardTitle>House Inputs</CardTitle>
                  <Badge variant="muted">Selected scenario</Badge>
                </div>
                <div className="grid gap-4">
                  <Field label="Purchase price">
                    <MoneyInput
                      valueCents={housePreview.purchasePriceCents}
                      onChange={(value) =>
                        updateHouseField("purchasePriceCents", Math.max(value, 0))
                      }
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <Field label="Down payment">
                      <Input
                        max="100"
                        min="0"
                        step="0.1"
                        type="number"
                        value={housePreview.downPaymentPercent}
                        onChange={(event) =>
                          updateHouseField(
                            "downPaymentPercent",
                            readNumber(event.target.value, 0)
                          )
                        }
                      />
                    </Field>
                    <Field label="Closing costs">
                      <Input
                        max="100"
                        min="0"
                        step="0.1"
                        type="number"
                        value={housePreview.closingCostPercent}
                        onChange={(event) =>
                          updateHouseField(
                            "closingCostPercent",
                            readNumber(event.target.value, 0)
                          )
                        }
                      />
                    </Field>
                    <Field label="Interest rate">
                      <Input
                        max="100"
                        min="0"
                        step="0.1"
                        type="number"
                        value={housePreview.interestRatePercent}
                        onChange={(event) =>
                          updateHouseField(
                            "interestRatePercent",
                            readNumber(event.target.value, 0)
                          )
                        }
                      />
                    </Field>
                    <Field label="Loan term">
                      <Input
                        max="40"
                        min="1"
                        step="1"
                        type="number"
                        value={housePreview.loanTermYears}
                        onChange={(event) =>
                          updateHouseField(
                            "loanTermYears",
                            Math.round(readNumber(event.target.value, 1))
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <ComparisonMetric
              baseValue={baseProjection.totals.endingNetWorthCents}
              deltaValue={comparison.netWorthDeltaCents}
              icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
              label="Projected net worth"
              whatIfValue={whatIfProjection.totals.endingNetWorthCents}
            />
            <ComparisonMetric
              baseValue={baseProjection.totals.endingSavingsCents}
              deltaValue={comparison.savingsDeltaCents}
              icon={<PiggyBank className="h-5 w-5" aria-hidden="true" />}
              label="Savings balance"
              whatIfValue={whatIfProjection.totals.endingSavingsCents}
            />
            <ComparisonMetric
              baseValue={baseProjection.totals.endingSpendableCents}
              deltaValue={comparison.spendableDeltaCents}
              icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
              label="Spendable cash"
              whatIfValue={whatIfProjection.totals.endingSpendableCents}
            />
            <ComparisonMetric
              baseValue={baseProjection.totals.cumulativeTaxCents}
              deltaValue={comparison.cumulativeTaxDeltaCents}
              icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />}
              label="Cumulative taxes"
              whatIfValue={whatIfProjection.totals.cumulativeTaxCents}
            />
          </section>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Projection Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[340px] w-full">
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ left: 0, right: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" minTickGap={32} />
                    <YAxis
                      tickFormatter={(value) => `$${Number(value) / 1000}k`}
                    />
                    <Tooltip
                      formatter={(value) =>
                        typeof value === "number"
                          ? formatMoney(Math.round(value * 100))
                          : value
                      }
                      isAnimationActive={false}
                      wrapperStyle={{ outline: "none", zIndex: 50 }}
                    />
                    <Legend />
                    <Line
                      activeDot={{ r: 4 }}
                      connectNulls
                      dataKey="Baseline"
                      dot={false}
                      stroke="#64748b"
                      strokeWidth={2}
                      type="monotone"
                    />
                    <Line
                      activeDot={{ r: 4 }}
                      connectNulls
                      dataKey="What-if"
                      dot={false}
                      stroke="#0f766e"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <SelectedGoalComparison
            baseGoal={comparison.selectedGoal?.base}
            whatIfGoal={comparison.selectedGoal?.whatIf}
          />

          {(baseProjection.warnings.length || whatIfProjection.warnings.length) ? (
            <section className="grid min-w-0 gap-6 lg:grid-cols-2">
              <WarningList
                title="Baseline Warnings"
                warnings={baseProjection.warnings}
              />
              <WarningList
                title="What-if Warnings"
                warnings={whatIfProjection.warnings}
              />
            </section>
          ) : null}
        </div>
      </div>

      {applyModalOpen ? (
        <ApplyConfirmationModal
          changeCount={changeCount}
          onCancel={() => setApplyModalOpen(false)}
          onConfirm={confirmApply}
        />
      ) : null}
    </div>
  );
}

function ComparisonMetric({
  baseValue,
  deltaValue,
  icon,
  label,
  whatIfValue
}: {
  baseValue: number;
  deltaValue: number;
  icon: ReactNode;
  label: string;
  whatIfValue: number;
}) {
  return (
    <MetricCard
      detail={`${formatSignedMoney(deltaValue)} vs ${formatMoney(baseValue)}`}
      icon={icon}
      label={label}
      value={formatMoney(whatIfValue)}
    />
  );
}

function SelectedGoalComparison({
  baseGoal,
  whatIfGoal
}: {
  baseGoal: GoalResult | undefined;
  whatIfGoal: GoalResult | undefined;
}) {
  const rows = [
    {
      label: "Required cash",
      base: baseGoal?.requiredCashCents,
      whatIf: whatIfGoal?.requiredCashCents
    },
    {
      label: "Available cash",
      base: baseGoal?.availableCashCents,
      whatIf: whatIfGoal?.availableCashCents
    },
    {
      label: "Surplus",
      base: baseGoal?.surplusOrShortfallCents,
      whatIf: whatIfGoal?.surplusOrShortfallCents
    },
    {
      label: "Monthly payment",
      base: baseGoal?.estimatedMonthlyPaymentCents,
      whatIf: whatIfGoal?.estimatedMonthlyPaymentCents
    }
  ];

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Selected Goal</CardTitle>
          {whatIfGoal ? (
            <Badge
              variant={
                whatIfGoal.surplusOrShortfallCents >= 0 ? "success" : "danger"
              }
            >
              {formatSignedMoney(whatIfGoal.surplusOrShortfallCents)}
            </Badge>
          ) : (
            <Badge variant="muted">No goal</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {baseGoal && whatIfGoal ? (
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 font-medium">Baseline</th>
                  <th className="px-3 py-2 font-medium">What-if</th>
                  <th className="px-3 py-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t border-border" key={row.label}>
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2">
                      {row.base === undefined ? "-" : formatMoney(row.base)}
                    </td>
                    <td className="px-3 py-2">
                      {row.whatIf === undefined
                        ? "-"
                        : formatMoney(row.whatIf)}
                    </td>
                    <td className="px-3 py-2">
                      {row.base === undefined || row.whatIf === undefined
                        ? "-"
                        : formatSignedMoney(row.whatIf - row.base)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Create a goal to compare feasibility.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WarningList({
  title,
  warnings
}: {
  title: string;
  warnings: ProjectionWarning[];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          <Badge variant={warnings.length ? "warning" : "success"}>
            {warnings.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {warnings.length ? (
          warnings.map((warning) => (
            <div
              className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              key={warning.id}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning.message}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No warnings</p>
        )}
      </CardContent>
    </Card>
  );
}

function ApplyConfirmationModal({
  changeCount,
  onCancel,
  onConfirm
}: {
  changeCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-md border border-border bg-card text-card-foreground shadow-soft">
        <div className="border-b border-border p-5">
          <CardTitle>Apply What-If Edits</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            This will write {changeCount} edit{changeCount === 1 ? "" : "s"} to
            the saved plan.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-5">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

function createInitialInputs(plan: PlanDocument): WhatIfInputs {
  const firstPeriod = [...plan.periods].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  )[0];
  const firstGoal = plan.goals[0];
  const firstScenario = firstGoal?.scenarios[0];

  return {
    ...defaultWhatIfInputs,
    selectedPeriodId: firstPeriod?.id,
    selectedGoalId: firstGoal?.id,
    selectedScenarioId: firstScenario?.id,
    goalTargetDate: firstScenario?.targetDate
  };
}

function normalizeInputsForPlan(
  inputs: WhatIfInputs,
  plan: PlanDocument
): WhatIfInputs {
  const fallback = createInitialInputs(plan);
  const periodExists = plan.periods.some(
    (period) => period.id === inputs.selectedPeriodId
  );
  const goal = plan.goals.find((item) => item.id === inputs.selectedGoalId);
  const scenario = goal?.scenarios.find(
    (item) => item.id === inputs.selectedScenarioId
  );
  const costOfLivingExists =
    !inputs.costOfLivingScenarioId ||
    plan.costOfLivingScenarios.some(
      (scenario) => scenario.id === inputs.costOfLivingScenarioId
    );

  return {
    ...inputs,
    costOfLivingScenarioId: costOfLivingExists
      ? inputs.costOfLivingScenarioId
      : undefined,
    selectedPeriodId: periodExists
      ? inputs.selectedPeriodId
      : fallback.selectedPeriodId,
    selectedGoalId: goal?.id ?? fallback.selectedGoalId,
    selectedScenarioId: scenario?.id ?? fallback.selectedScenarioId,
    goalTargetDate:
      scenario?.targetDate ??
      (goal?.scenarios[0]?.targetDate || fallback.goalTargetDate),
    house: scenario && isHouseScenario(scenario) ? inputs.house : undefined
  };
}

function createProjectionComparisonData(
  baseProjection: ProjectionResult,
  whatIfProjection: ProjectionResult
): ProjectionComparisonDatum[] {
  const baseByMonth = new Map(
    baseProjection.months.map((month) => [month.month, month])
  );
  const whatIfByMonth = new Map(
    whatIfProjection.months.map((month) => [month.month, month])
  );
  const monthKeys = [...new Set([...baseByMonth.keys(), ...whatIfByMonth.keys()])]
    .sort((a, b) => a.localeCompare(b));

  return monthKeys.map((monthKey) => {
    const baseMonth = baseByMonth.get(monthKey);
    const whatIfMonth = whatIfByMonth.get(monthKey);

    return {
      month: baseMonth?.label ?? whatIfMonth?.label ?? monthKey,
      Baseline: baseMonth
        ? (baseMonth.closingSpendableCents + baseMonth.closingSavingsCents) / 100
        : null,
      "What-if": whatIfMonth
        ? (whatIfMonth.closingSpendableCents +
            whatIfMonth.closingSavingsCents) /
          100
        : null
    };
  });
}

function getWhatIfChangeCount(
  inputs: WhatIfInputs,
  selectedScenario: GoalScenario | undefined
): number {
  let count = 0;
  if (Math.abs(inputs.incomeMultiplier - 1) > 0.0001) {
    count += 1;
  }
  if (inputs.savingsRateDelta !== 0) {
    count += 1;
  }
  if (inputs.costOfLivingScenarioId) {
    count += 1;
  }
  if (inputs.oneTimeExpenseCents > 0) {
    count += 1;
  }
  if (
    selectedScenario &&
    inputs.goalTargetDate &&
    inputs.goalTargetDate !== selectedScenario.targetDate
  ) {
    count += 1;
  }
  if (selectedScenario?.house && hasHouseOverrides(inputs.house, selectedScenario.house)) {
    count += 1;
  }
  return count;
}

function hasHouseOverrides(
  overrides: Partial<HouseGoalFields> | undefined,
  baseFields: HouseGoalFields
): boolean {
  if (!overrides) {
    return false;
  }
  return (
    overrides.purchasePriceCents !== undefined &&
      overrides.purchasePriceCents !== baseFields.purchasePriceCents
  ) ||
    (overrides.downPaymentPercent !== undefined &&
      overrides.downPaymentPercent !== baseFields.downPaymentPercent) ||
    (overrides.closingCostPercent !== undefined &&
      overrides.closingCostPercent !== baseFields.closingCostPercent) ||
    (overrides.interestRatePercent !== undefined &&
      overrides.interestRatePercent !== baseFields.interestRatePercent) ||
    (overrides.loanTermYears !== undefined &&
      overrides.loanTermYears !== baseFields.loanTermYears);
}

function isHouseScenario(scenario: GoalScenario): boolean {
  return Boolean(
    scenario.house && (scenario.type === "house" || scenario.type === undefined)
  );
}

function readNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSignedMoney(cents: number): string {
  if (cents > 0) {
    return `+${formatMoney(cents)}`;
  }
  return formatMoney(cents);
}
