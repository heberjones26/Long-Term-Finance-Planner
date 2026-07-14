import {
  AlertTriangle,
  Banknote,
  FlaskConical,
  PiggyBank,
  Plus,
  RotateCcw,
  Save,
  Target,
  Trash2,
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
import { createId } from "../domain/ids";
import { formatMoney } from "../domain/money";
import { projectPlan } from "../domain/projection";
import type {
  CostItem,
  FinancialPeriod,
  GoalResult,
  Id,
  MoneyCents,
  PlanDocument,
  ProjectionResult,
  ProjectionWarning,
  RecurringMoneyItem
} from "../domain/types";
import {
  applyWhatIfInputs,
  createWhatIfComparison,
  defaultWhatIfInputs,
  type WhatIfCostOfLivingItemOverride,
  type WhatIfPeriodItemKind,
  type WhatIfPeriodItemOverride,
  type WhatIfPeriodSavingsRateOverride,
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
  const costOfLivingItemOverrides = useMemo(
    () => inputs.costOfLivingItemOverrides ?? [],
    [inputs.costOfLivingItemOverrides]
  );
  const periodItemOverrides = useMemo(
    () => inputs.periodItemOverrides ?? [],
    [inputs.periodItemOverrides]
  );
  const periodSavingsRateOverrides = useMemo(
    () => inputs.periodSavingsRateOverrides ?? [],
    [inputs.periodSavingsRateOverrides]
  );
  const selectedGoal = plan?.goals.find(
    (goal) => goal.id === inputs.selectedGoalId
  );
  const firstCostOfLivingOverrideTarget = useMemo(
    () =>
      plan
        ? findFirstAvailableCostOfLivingItem(plan, costOfLivingItemOverrides)
        : undefined,
    [costOfLivingItemOverrides, plan]
  );
  const firstPeriodOverrideTarget = useMemo(
    () => findFirstAvailablePeriodItem(sortedPeriods, periodItemOverrides),
    [periodItemOverrides, sortedPeriods]
  );
  const firstSavingsRateOverrideTarget = useMemo(
    () =>
      sortedPeriods.find(
        (period) =>
          !periodSavingsRateOverrides.some(
            (override) => override.periodId === period.id
          )
      ),
    [periodSavingsRateOverrides, sortedPeriods]
  );

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
  const changeCount = plan ? getWhatIfChangeCount(inputs, plan) : 0;
  const hasChanges = changeCount > 0;

  if (!plan || !baseProjection || !whatIfProjection || !comparison) {
    return null;
  }

  const updateInput = (updates: Partial<WhatIfInputs>) => {
    setInputs((current) => ({ ...current, ...updates }));
  };

  const addCostOfLivingOverride = () => {
    if (!firstCostOfLivingOverrideTarget) {
      return;
    }

    setInputs((current) => ({
      ...current,
      costOfLivingItemOverrides: [
        ...(current.costOfLivingItemOverrides ?? []),
        {
          id: createId("what_if_col_item"),
          costOfLivingScenarioId: firstCostOfLivingOverrideTarget.scenario.id,
          itemId: firstCostOfLivingOverrideTarget.item.id,
          amountCents: firstCostOfLivingOverrideTarget.item.amountCents
        }
      ]
    }));
  };

  const updateCostOfLivingOverride = (
    overrideId: Id,
    updates: Partial<WhatIfCostOfLivingItemOverride>
  ) => {
    setInputs((current) => {
      const overrides = current.costOfLivingItemOverrides ?? [];

      return {
        ...current,
        costOfLivingItemOverrides: overrides.map((override) => {
          if (override.id !== overrideId) {
            return override;
          }

          const nextOverride = { ...override, ...updates };

          if (
            updates.costOfLivingScenarioId &&
            updates.costOfLivingScenarioId !== override.costOfLivingScenarioId
          ) {
            const scenario = plan.costOfLivingScenarios.find(
              (item) => item.id === updates.costOfLivingScenarioId
            );
            const firstItem =
              scenario?.items.find(
                (item) =>
                  !isCostOfLivingTargetTaken(
                    overrides,
                    override.id,
                    scenario.id,
                    item.id
                  )
              ) ?? scenario?.items[0];

            return {
              ...nextOverride,
              itemId: firstItem?.id ?? "",
              amountCents: firstItem?.amountCents ?? 0
            };
          }

          if (updates.itemId && updates.itemId !== override.itemId) {
            const scenario = plan.costOfLivingScenarios.find(
              (item) => item.id === nextOverride.costOfLivingScenarioId
            );
            const item = scenario?.items.find(
              (candidate) => candidate.id === updates.itemId
            );

            return {
              ...nextOverride,
              amountCents: item?.amountCents ?? 0
            };
          }

          return nextOverride;
        })
      };
    });
  };

  const removeCostOfLivingOverride = (overrideId: Id) => {
    setInputs((current) => ({
      ...current,
      costOfLivingItemOverrides: (current.costOfLivingItemOverrides ?? []).filter(
        (override) => override.id !== overrideId
      )
    }));
  };

  const addPeriodOverride = () => {
    if (!firstPeriodOverrideTarget) {
      return;
    }

    setInputs((current) => ({
      ...current,
      periodItemOverrides: [
        ...(current.periodItemOverrides ?? []),
        {
          id: createId("what_if_period_item"),
          periodId: firstPeriodOverrideTarget.period.id,
          itemKind: firstPeriodOverrideTarget.itemKind,
          itemId: firstPeriodOverrideTarget.item.id,
          amountCents: firstPeriodOverrideTarget.item.amountCents
        }
      ]
    }));
  };

  const updatePeriodOverride = (
    overrideId: Id,
    updates: Partial<WhatIfPeriodItemOverride>
  ) => {
    setInputs((current) => {
      const overrides = current.periodItemOverrides ?? [];

      return {
        ...current,
        periodItemOverrides: overrides.map((override) => {
        if (override.id !== overrideId) {
          return override;
        }

        const nextOverride = { ...override, ...updates };

        if (updates.periodId && updates.periodId !== override.periodId) {
          const period = sortedPeriods.find(
            (item) => item.id === updates.periodId
          );
          const itemKind = findAvailablePeriodItemKind(
            period,
            nextOverride.itemKind,
            overrides,
            override.id
          );
          const firstItem =
            getPeriodItems(period, itemKind).find(
              (item) =>
                !isPeriodTargetTaken(
                  overrides,
                  override.id,
                  nextOverride.periodId,
                  itemKind,
                  item.id
                )
            ) ?? getPeriodItems(period, itemKind)[0];

          return {
            ...nextOverride,
            itemKind,
            itemId: firstItem?.id ?? "",
            amountCents: firstItem?.amountCents ?? 0
          };
        }

        if (updates.itemKind && updates.itemKind !== override.itemKind) {
          const period = sortedPeriods.find(
            (item) => item.id === nextOverride.periodId
          );
          const firstItem =
            getPeriodItems(period, updates.itemKind).find(
              (item) =>
                !isPeriodTargetTaken(
                  overrides,
                  override.id,
                  nextOverride.periodId,
                  updates.itemKind as WhatIfPeriodItemKind,
                  item.id
                )
            ) ?? getPeriodItems(period, updates.itemKind)[0];

          return {
            ...nextOverride,
            itemId: firstItem?.id ?? "",
            amountCents: firstItem?.amountCents ?? 0
          };
        }

        if (updates.itemId && updates.itemId !== override.itemId) {
          const period = sortedPeriods.find(
            (item) => item.id === nextOverride.periodId
          );
          const item = getPeriodItems(period, nextOverride.itemKind).find(
            (candidate) => candidate.id === updates.itemId
          );

          return {
            ...nextOverride,
            amountCents: item?.amountCents ?? 0
          };
        }

        return nextOverride;
      })
      };
    });
  };

  const removePeriodOverride = (overrideId: Id) => {
    setInputs((current) => ({
      ...current,
      periodItemOverrides: (current.periodItemOverrides ?? []).filter(
        (override) => override.id !== overrideId
      )
    }));
  };

  const addSavingsRateOverride = () => {
    if (!firstSavingsRateOverrideTarget) {
      return;
    }

    setInputs((current) => ({
      ...current,
      periodSavingsRateOverrides: [
        ...(current.periodSavingsRateOverrides ?? []),
        {
          id: createId("what_if_savings_rate"),
          periodId: firstSavingsRateOverrideTarget.id,
          savingsRate: firstSavingsRateOverrideTarget.savingsRate
        }
      ]
    }));
  };

  const updateSavingsRateOverride = (
    overrideId: Id,
    updates: Partial<WhatIfPeriodSavingsRateOverride>
  ) => {
    setInputs((current) => {
      const overrides = current.periodSavingsRateOverrides ?? [];

      return {
        ...current,
        periodSavingsRateOverrides: overrides.map((override) => {
          if (override.id !== overrideId) {
            return override;
          }

          const nextOverride = { ...override, ...updates };

          if (updates.periodId && updates.periodId !== override.periodId) {
            const period = sortedPeriods.find(
              (item) => item.id === updates.periodId
            );

            return {
              ...nextOverride,
              savingsRate: period?.savingsRate ?? 0
            };
          }

          return nextOverride;
        })
      };
    });
  };

  const removeSavingsRateOverride = (overrideId: Id) => {
    setInputs((current) => ({
      ...current,
      periodSavingsRateOverrides: (
        current.periodSavingsRateOverrides ?? []
      ).filter((override) => override.id !== overrideId)
    }));
  };

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
                {changeCount} item edit{changeCount === 1 ? "" : "s"}
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
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Cost-of-Living Items</CardTitle>
                <Button
                  disabled={!firstCostOfLivingOverrideTarget}
                  onClick={addCostOfLivingOverride}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  COL Item
                </Button>
              </div>
              {costOfLivingItemOverrides.length ? (
                <div className="space-y-3">
                  {costOfLivingItemOverrides.map((override) => (
                    <CostOfLivingOverrideRow
                      key={override.id}
                      onRemove={removeCostOfLivingOverride}
                      onUpdate={updateCostOfLivingOverride}
                      override={override}
                      overrides={costOfLivingItemOverrides}
                      plan={plan}
                    />
                  ))}
                </div>
              ) : (
                <EmptyOverrideState label="No cost-of-living item edits" />
              )}
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Period Items</CardTitle>
                <Button
                  disabled={!firstPeriodOverrideTarget}
                  onClick={addPeriodOverride}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Period Item
                </Button>
              </div>
              {periodItemOverrides.length ? (
                <div className="space-y-3">
                  {periodItemOverrides.map((override) => (
                    <PeriodOverrideRow
                      key={override.id}
                      onRemove={removePeriodOverride}
                      onUpdate={updatePeriodOverride}
                      override={override}
                      overrides={periodItemOverrides}
                      periods={sortedPeriods}
                    />
                  ))}
                </div>
              ) : (
                <EmptyOverrideState label="No period item edits" />
              )}
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Period Savings Rate</CardTitle>
                <Button
                  disabled={!firstSavingsRateOverrideTarget}
                  onClick={addSavingsRateOverride}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Savings Rate
                </Button>
              </div>
              {periodSavingsRateOverrides.length ? (
                <div className="space-y-3">
                  {periodSavingsRateOverrides.map((override) => (
                    <SavingsRateOverrideRow
                      key={override.id}
                      onRemove={removeSavingsRateOverride}
                      onUpdate={updateSavingsRateOverride}
                      override={override}
                      overrides={periodSavingsRateOverrides}
                      periods={sortedPeriods}
                    />
                  ))}
                </div>
              ) : (
                <EmptyOverrideState label="No savings rate edits" />
              )}
            </div>

            <div className="space-y-4 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <CardTitle>Goal Focus</CardTitle>
                </div>
                <Badge variant="muted">Comparison only</Badge>
              </div>
              <div className="grid gap-4">
                <Field label="Goal">
                  <Select
                    aria-label="Goal focus"
                    disabled={!plan.goals.length}
                    value={inputs.selectedGoalId ?? ""}
                    onChange={(event) => {
                      const goal = plan.goals.find(
                        (item) => item.id === event.target.value
                      );
                      const scenario = goal?.scenarios[0];
                      updateInput({
                        selectedGoalId: goal?.id,
                        selectedScenarioId: scenario?.id
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
                    aria-label="Goal scenario focus"
                    disabled={!selectedGoal}
                    value={inputs.selectedScenarioId ?? ""}
                    onChange={(event) => {
                      const scenario = selectedGoal?.scenarios.find(
                        (item) => item.id === event.target.value
                      );
                      updateInput({
                        selectedScenarioId: scenario?.id
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
              </div>
            </div>
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

function EmptyOverrideState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CostOfLivingOverrideRow({
  onRemove,
  onUpdate,
  override,
  overrides,
  plan
}: {
  onRemove: (overrideId: Id) => void;
  onUpdate: (
    overrideId: Id,
    updates: Partial<WhatIfCostOfLivingItemOverride>
  ) => void;
  override: WhatIfCostOfLivingItemOverride;
  overrides: WhatIfCostOfLivingItemOverride[];
  plan: PlanDocument;
}) {
  const scenario = plan.costOfLivingScenarios.find(
    (item) => item.id === override.costOfLivingScenarioId
  );
  const selectedItem = scenario?.items.find(
    (item) => item.id === override.itemId
  );
  const changed =
    selectedItem !== undefined &&
    normalizeMoneyCents(override.amountCents) !== selectedItem.amountCents;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Badge variant={changed ? "warning" : "muted"}>
          {changed ? "Changed" : "Baseline"}
        </Badge>
        <Button
          aria-label="Remove cost-of-living item edit"
          onClick={() => onRemove(override.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-3">
        <Field label="Scenario">
          <Select
            aria-label="Cost-of-living scenario"
            value={override.costOfLivingScenarioId}
            onChange={(event) =>
              onUpdate(override.id, {
                costOfLivingScenarioId: event.target.value
              })
            }
          >
            {plan.costOfLivingScenarios.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Item">
          <Select
            aria-label="Cost-of-living item"
            disabled={!scenario?.items.length}
            value={selectedItem?.id ?? ""}
            onChange={(event) =>
              onUpdate(override.id, {
                itemId: event.target.value
              })
            }
          >
            {scenario?.items.length ? null : <option value="">No items</option>}
            {scenario?.items.map((item) => (
              <option
                disabled={isCostOfLivingTargetTaken(
                  overrides,
                  override.id,
                  scenario.id,
                  item.id
                )}
                key={item.id}
                value={item.id}
              >
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount">
          <MoneyInput
            aria-label="Cost-of-living override amount"
            disabled={!selectedItem}
            valueCents={override.amountCents}
            onChange={(value) =>
              onUpdate(override.id, { amountCents: Math.max(value, 0) })
            }
          />
        </Field>
      </div>
    </div>
  );
}

function PeriodOverrideRow({
  onRemove,
  onUpdate,
  override,
  overrides,
  periods
}: {
  onRemove: (overrideId: Id) => void;
  onUpdate: (
    overrideId: Id,
    updates: Partial<WhatIfPeriodItemOverride>
  ) => void;
  override: WhatIfPeriodItemOverride;
  overrides: WhatIfPeriodItemOverride[];
  periods: FinancialPeriod[];
}) {
  const period = periods.find((item) => item.id === override.periodId);
  const items = getPeriodItems(period, override.itemKind);
  const selectedItem = items.find((item) => item.id === override.itemId);
  const changed =
    selectedItem !== undefined &&
    normalizeMoneyCents(override.amountCents) !== selectedItem.amountCents;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Badge variant={changed ? "warning" : "muted"}>
          {changed ? "Changed" : "Baseline"}
        </Badge>
        <Button
          aria-label="Remove period item edit"
          onClick={() => onRemove(override.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-3">
        <Field label="Period">
          <Select
            aria-label="Period"
            value={override.periodId}
            onChange={(event) =>
              onUpdate(override.id, { periodId: event.target.value })
            }
          >
            {periods.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            aria-label="Period item type"
            value={override.itemKind}
            onChange={(event) =>
              onUpdate(override.id, {
                itemKind: event.target.value as WhatIfPeriodItemKind
              })
            }
          >
            {periodItemKindOptions.map((option) => (
              <option
                disabled={!getPeriodItems(period, option.value).length}
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Item">
          <Select
            aria-label="Period item"
            disabled={!items.length}
            value={selectedItem?.id ?? ""}
            onChange={(event) =>
              onUpdate(override.id, {
                itemId: event.target.value
              })
            }
          >
            {items.length ? null : <option value="">No items</option>}
            {items.map((item) => (
              <option
                disabled={isPeriodTargetTaken(
                  overrides,
                  override.id,
                  override.periodId,
                  override.itemKind,
                  item.id
                )}
                key={item.id}
                value={item.id}
              >
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount">
          <MoneyInput
            aria-label="Period override amount"
            disabled={!selectedItem}
            valueCents={override.amountCents}
            onChange={(value) =>
              onUpdate(override.id, { amountCents: Math.max(value, 0) })
            }
          />
        </Field>
      </div>
    </div>
  );
}

function SavingsRateOverrideRow({
  onRemove,
  onUpdate,
  override,
  overrides,
  periods
}: {
  onRemove: (overrideId: Id) => void;
  onUpdate: (
    overrideId: Id,
    updates: Partial<WhatIfPeriodSavingsRateOverride>
  ) => void;
  override: WhatIfPeriodSavingsRateOverride;
  overrides: WhatIfPeriodSavingsRateOverride[];
  periods: FinancialPeriod[];
}) {
  const period = periods.find((item) => item.id === override.periodId);
  const changed =
    period !== undefined &&
    normalizeRate(override.savingsRate) !== period.savingsRate;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Badge variant={changed ? "warning" : "muted"}>
          {changed ? "Changed" : "Baseline"}
        </Badge>
        <Button
          aria-label="Remove savings rate edit"
          onClick={() => onRemove(override.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-3">
        <Field label="Period">
          <Select
            aria-label="Savings rate period"
            value={override.periodId}
            onChange={(event) =>
              onUpdate(override.id, { periodId: event.target.value })
            }
          >
            {periods.map((candidate) => (
              <option
                disabled={overrides.some(
                  (other) =>
                    other.id !== override.id &&
                    other.periodId === candidate.id
                )}
                key={candidate.id}
                value={candidate.id}
              >
                {candidate.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Savings rate">
          <Input
            aria-label="Savings rate override"
            disabled={!period}
            max="100"
            min="0"
            step="0.1"
            type="number"
            value={override.savingsRate}
            onChange={(event) =>
              onUpdate(override.id, {
                savingsRate: Number(event.target.value)
              })
            }
          />
        </Field>
      </div>
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
            This will write {changeCount} item edit
            {changeCount === 1 ? "" : "s"} to the saved plan.
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
  const firstGoal = plan.goals[0];
  const firstScenario = firstGoal?.scenarios[0];

  return {
    ...defaultWhatIfInputs,
    selectedGoalId: firstGoal?.id,
    selectedScenarioId: firstScenario?.id
  };
}

function normalizeInputsForPlan(
  inputs: WhatIfInputs,
  plan: PlanDocument
): WhatIfInputs {
  const fallback = createInitialInputs(plan);
  const goal =
    plan.goals.find((item) => item.id === inputs.selectedGoalId) ??
    plan.goals.find((item) => item.id === fallback.selectedGoalId);
  const scenario =
    goal?.scenarios.find((item) => item.id === inputs.selectedScenarioId) ??
    goal?.scenarios[0];

  return {
    ...inputs,
    costOfLivingItemOverrides: (inputs.costOfLivingItemOverrides ?? []).filter(
      (override) => Boolean(findCostOfLivingItem(plan, override))
    ),
    periodItemOverrides: (inputs.periodItemOverrides ?? []).filter((override) =>
      Boolean(findPeriodItem(plan.periods, override))
    ),
    periodSavingsRateOverrides: (
      inputs.periodSavingsRateOverrides ?? []
    ).filter((override) =>
      plan.periods.some((period) => period.id === override.periodId)
    ),
    selectedGoalId: goal?.id ?? fallback.selectedGoalId,
    selectedScenarioId: scenario?.id ?? fallback.selectedScenarioId
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
  plan: PlanDocument
): number {
  let count = 0;

  for (const override of inputs.costOfLivingItemOverrides ?? []) {
    const item = findCostOfLivingItem(plan, override);
    if (
      item &&
      normalizeMoneyCents(override.amountCents) !== item.amountCents
    ) {
      count += 1;
    }
  }

  for (const override of inputs.periodItemOverrides ?? []) {
    const item = findPeriodItem(plan.periods, override);
    if (
      item &&
      normalizeMoneyCents(override.amountCents) !== item.amountCents
    ) {
      count += 1;
    }
  }

  for (const override of inputs.periodSavingsRateOverrides ?? []) {
    const period = plan.periods.find((item) => item.id === override.periodId);
    if (
      period &&
      normalizeRate(override.savingsRate) !== period.savingsRate
    ) {
      count += 1;
    }
  }

  return count;
}

const periodItemKindOptions: Array<{
  value: WhatIfPeriodItemKind;
  label: string;
}> = [
  { value: "grossIncome", label: "Income" },
  { value: "extraExpense", label: "Extra expense" }
];

function findFirstAvailableCostOfLivingItem(
  plan: PlanDocument,
  overrides: WhatIfCostOfLivingItemOverride[]
):
  | {
      scenario: PlanDocument["costOfLivingScenarios"][number];
      item: CostItem;
    }
  | undefined {
  for (const scenario of plan.costOfLivingScenarios) {
    const item = scenario.items.find(
      (candidate) =>
        !isCostOfLivingTargetTaken(
          overrides,
          undefined,
          scenario.id,
          candidate.id
        )
    );
    if (item) {
      return { scenario, item };
    }
  }
  return undefined;
}

function findFirstAvailablePeriodItem(
  periods: FinancialPeriod[],
  overrides: WhatIfPeriodItemOverride[]
):
  | {
      period: FinancialPeriod;
      itemKind: WhatIfPeriodItemKind;
      item: RecurringMoneyItem;
    }
  | undefined {
  for (const period of periods) {
    const grossIncomeItem = period.grossIncomeItems.find(
      (item) =>
        !isPeriodTargetTaken(
          overrides,
          undefined,
          period.id,
          "grossIncome",
          item.id
        )
    );
    if (grossIncomeItem) {
      return {
        period,
        itemKind: "grossIncome",
        item: grossIncomeItem
      };
    }

    const extraExpenseItem = period.extraExpenseItems.find(
      (item) =>
        !isPeriodTargetTaken(
          overrides,
          undefined,
          period.id,
          "extraExpense",
          item.id
        )
    );
    if (extraExpenseItem) {
      return {
        period,
        itemKind: "extraExpense",
        item: extraExpenseItem
      };
    }
  }
  return undefined;
}

function findAvailablePeriodItemKind(
  period: FinancialPeriod | undefined,
  preferredKind: WhatIfPeriodItemKind,
  overrides: WhatIfPeriodItemOverride[],
  currentOverrideId: Id | undefined
): WhatIfPeriodItemKind {
  if (
    getPeriodItems(period, preferredKind).some(
      (item) =>
        period &&
        !isPeriodTargetTaken(
          overrides,
          currentOverrideId,
          period.id,
          preferredKind,
          item.id
        )
    )
  ) {
    return preferredKind;
  }

  return (
    periodItemKindOptions.find((option) =>
      getPeriodItems(period, option.value).some(
        (item) =>
          period &&
          !isPeriodTargetTaken(
            overrides,
            currentOverrideId,
            period.id,
            option.value,
            item.id
          )
      )
    )?.value ?? preferredKind
  );
}

function getPeriodItems(
  period: FinancialPeriod | undefined,
  itemKind: WhatIfPeriodItemKind
): RecurringMoneyItem[] {
  if (!period) {
    return [];
  }
  return itemKind === "grossIncome"
    ? period.grossIncomeItems
    : period.extraExpenseItems;
}

function findCostOfLivingItem(
  plan: PlanDocument,
  override: Pick<
    WhatIfCostOfLivingItemOverride,
    "costOfLivingScenarioId" | "itemId"
  >
): CostItem | undefined {
  return plan.costOfLivingScenarios
    .find((scenario) => scenario.id === override.costOfLivingScenarioId)
    ?.items.find((item) => item.id === override.itemId);
}

function findPeriodItem(
  periods: FinancialPeriod[],
  override: Pick<
    WhatIfPeriodItemOverride,
    "itemKind" | "itemId" | "periodId"
  >
): RecurringMoneyItem | undefined {
  const period = periods.find((item) => item.id === override.periodId);
  return getPeriodItems(period, override.itemKind).find(
    (item) => item.id === override.itemId
  );
}

function isCostOfLivingTargetTaken(
  overrides: WhatIfCostOfLivingItemOverride[],
  currentOverrideId: Id | undefined,
  costOfLivingScenarioId: Id,
  itemId: Id
): boolean {
  return overrides.some(
    (override) =>
      override.id !== currentOverrideId &&
      override.costOfLivingScenarioId === costOfLivingScenarioId &&
      override.itemId === itemId
  );
}

function isPeriodTargetTaken(
  overrides: WhatIfPeriodItemOverride[],
  currentOverrideId: Id | undefined,
  periodId: Id,
  itemKind: WhatIfPeriodItemKind,
  itemId: Id
): boolean {
  return overrides.some(
    (override) =>
      override.id !== currentOverrideId &&
      override.periodId === periodId &&
      override.itemKind === itemKind &&
      override.itemId === itemId
  );
}

function normalizeMoneyCents(value: MoneyCents): MoneyCents {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.round(value), 0);
}

function normalizeRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

function formatSignedMoney(cents: number): string {
  if (cents > 0) {
    return `+${formatMoney(cents)}`;
  }
  return formatMoney(cents);
}
