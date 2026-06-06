import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "../components/MoneyInput";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { createId } from "../domain/ids";
import { formatMoney, formatPercent } from "../domain/money";
import {
  estimateHousePaymentCents,
  projectPlan,
  requiredCashForGoalScenario
} from "../domain/projection";
import type { Goal, GoalScenario, HouseGoalFields } from "../domain/types";
import { cn } from "../lib/utils";
import { usePlannerStore } from "../store/plannerStore";

export function GoalsPage() {
  const { plan, updatePlan } = usePlannerStore();
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const projection = useMemo(() => (plan ? projectPlan(plan) : null), [plan]);

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (!selectedGoalId || !plan.goals.some((goal) => goal.id === selectedGoalId)) {
      const firstGoal = plan.goals[0];
      setSelectedGoalId(firstGoal?.id ?? "");
      setSelectedScenarioId(firstGoal?.scenarios[0]?.id ?? "");
      return;
    }
    const goal = plan.goals.find((item) => item.id === selectedGoalId);
    if (
      goal &&
      (!selectedScenarioId ||
        !goal.scenarios.some((scenario) => scenario.id === selectedScenarioId))
    ) {
      setSelectedScenarioId(goal.scenarios[0]?.id ?? "");
    }
  }, [plan, selectedGoalId, selectedScenarioId]);

  if (!plan || !projection) {
    return null;
  }

  const selectedGoal = plan.goals.find((goal) => goal.id === selectedGoalId);
  const selectedScenario = selectedGoal?.scenarios.find(
    (scenario) => scenario.id === selectedScenarioId
  );
  const selectedResult = projection.goalResults.find(
    (result) =>
      result.goalId === selectedGoal?.id &&
      result.scenarioId === selectedScenario?.id
  );

  const updateGoal = (goalId: string, updater: (goal: Goal) => void) => {
    void updatePlan((draft) => {
      const goal = draft.goals.find((item) => item.id === goalId);
      if (goal) {
        updater(goal);
      }
      return draft;
    });
  };

  const updateScenario = (
    goalId: string,
    scenarioId: string,
    updater: (scenario: GoalScenario) => void
  ) => {
    updateGoal(goalId, (goal) => {
      const scenario = goal.scenarios.find((item) => item.id === scenarioId);
      if (scenario) {
        updater(scenario);
      }
    });
  };

  const addGoal = () => {
    const goalId = createId("goal");
    const scenarioId = createId("goal_scenario");
    void updatePlan((draft) => {
      draft.goals.push({
        id: goalId,
        name: "New goal",
        notes: "",
        scenarios: [
          {
            id: scenarioId,
            name: "Base",
            targetDate: "2030-01-01",
            targetAmountCents: 5000000,
            house: defaultHouseFields()
          }
        ]
      });
      return draft;
    });
    setSelectedGoalId(goalId);
    setSelectedScenarioId(scenarioId);
  };

  const deleteGoal = () => {
    if (!selectedGoal) {
      return;
    }
    void updatePlan((draft) => {
      draft.goals = draft.goals.filter((goal) => goal.id !== selectedGoal.id);
      return draft;
    });
    const fallback = plan.goals.find((goal) => goal.id !== selectedGoal.id);
    setSelectedGoalId(fallback?.id ?? "");
    setSelectedScenarioId(fallback?.scenarios[0]?.id ?? "");
  };

  const addScenario = () => {
    if (!selectedGoal) {
      return;
    }
    const scenarioId = createId("goal_scenario");
    updateGoal(selectedGoal.id, (goal) => {
      goal.scenarios.push({
        id: scenarioId,
        name: "New scenario",
        targetDate: goal.scenarios[0]?.targetDate ?? "2030-01-01",
        targetAmountCents: goal.scenarios[0]?.targetAmountCents ?? 5000000,
        house: structuredClone(goal.scenarios[0]?.house ?? defaultHouseFields())
      });
    });
    setSelectedScenarioId(scenarioId);
  };

  const duplicateScenario = () => {
    if (!selectedGoal || !selectedScenario) {
      return;
    }
    const scenarioId = createId("goal_scenario");
    updateGoal(selectedGoal.id, (goal) => {
      goal.scenarios.push({
        ...structuredClone(selectedScenario),
        id: scenarioId,
        name: `${selectedScenario.name} copy`
      });
    });
    setSelectedScenarioId(scenarioId);
  };

  const deleteScenario = () => {
    if (!selectedGoal || !selectedScenario || selectedGoal.scenarios.length <= 1) {
      return;
    }
    updateGoal(selectedGoal.id, (goal) => {
      goal.scenarios = goal.scenarios.filter(
        (scenario) => scenario.id !== selectedScenario.id
      );
    });
    const fallback = selectedGoal.scenarios.find(
      (scenario) => scenario.id !== selectedScenario.id
    );
    setSelectedScenarioId(fallback?.id ?? "");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Goal Scenarios"
        title="Goals"
        actions={
          <>
            <Button onClick={addGoal} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Goal
            </Button>
            <Button
              disabled={!selectedGoal}
              onClick={addScenario}
              type="button"
              variant="outline"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Scenario
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {plan.goals.map((goal) => (
            <button
              className={cn(
                "w-full rounded-md border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary",
                goal.id === selectedGoal?.id && "border-primary bg-primary/5"
              )}
              key={goal.id}
              onClick={() => {
                setSelectedGoalId(goal.id);
                setSelectedScenarioId(goal.scenarios[0]?.id ?? "");
              }}
              type="button"
            >
              <p className="font-medium">{goal.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {goal.scenarios.length} scenario
                {goal.scenarios.length === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </aside>

        {selectedGoal && selectedScenario ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{selectedGoal.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Goal name">
                    <Input
                      value={selectedGoal.name}
                      onChange={(event) =>
                        updateGoal(selectedGoal.id, (goal) => {
                          goal.name = event.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field label="Scenario">
                    <Select
                      value={selectedScenario.id}
                      onChange={(event) => setSelectedScenarioId(event.target.value)}
                    >
                      {selectedGoal.scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Notes">
                  <Textarea
                    value={selectedGoal.notes ?? ""}
                    onChange={(event) =>
                      updateGoal(selectedGoal.id, (goal) => {
                        goal.notes = event.target.value;
                      })
                    }
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={duplicateScenario}
                    type="button"
                    variant="outline"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Duplicate Scenario
                  </Button>
                  <Button
                    disabled={selectedGoal.scenarios.length <= 1}
                    onClick={deleteScenario}
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete Scenario
                  </Button>
                  <Button
                    disabled={plan.goals.length <= 1}
                    onClick={deleteGoal}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete Goal
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedScenario.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Scenario name">
                    <Input
                      value={selectedScenario.name}
                      onChange={(event) =>
                        updateScenario(
                          selectedGoal.id,
                          selectedScenario.id,
                          (scenario) => {
                            scenario.name = event.target.value;
                          }
                        )
                      }
                    />
                  </Field>
                  <Field label="Target date">
                    <Input
                      type="date"
                      value={selectedScenario.targetDate}
                      onChange={(event) =>
                        updateScenario(
                          selectedGoal.id,
                          selectedScenario.id,
                          (scenario) => {
                            scenario.targetDate = event.target.value;
                          }
                        )
                      }
                    />
                  </Field>
                  <Field label="Cash target">
                    <MoneyInput
                      valueCents={selectedScenario.targetAmountCents}
                      onChange={(value) =>
                        updateScenario(
                          selectedGoal.id,
                          selectedScenario.id,
                          (scenario) => {
                            scenario.targetAmountCents = value;
                          }
                        )
                      }
                    />
                  </Field>
                  <Field label="Required cash">
                    <Input
                      readOnly
                      value={formatMoney(requiredCashForGoalScenario(selectedScenario))}
                    />
                  </Field>
                </div>

                <HouseFields
                  fields={selectedScenario.house ?? defaultHouseFields()}
                  onChange={(house) =>
                    updateScenario(
                      selectedGoal.id,
                      selectedScenario.id,
                      (scenario) => {
                        scenario.house = house;
                      }
                    )
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feasibility</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedResult ? (
                  <div className="grid gap-4 md:grid-cols-4">
                    <ResultPill
                      label="Funded"
                      value={formatPercent(Math.round(selectedResult.percentFunded))}
                    />
                    <ResultPill
                      label="Available"
                      value={formatMoney(selectedResult.availableCashCents)}
                    />
                    <ResultPill
                      label="Delta"
                      value={formatMoney(selectedResult.surplusOrShortfallCents)}
                      status={
                        selectedResult.surplusOrShortfallCents >= 0
                          ? "success"
                          : "danger"
                      }
                    />
                    <ResultPill
                      label="Payment"
                      value={
                        selectedResult.estimatedMonthlyPaymentCents
                          ? formatMoney(selectedResult.estimatedMonthlyPaymentCents)
                          : "-"
                      }
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HouseFields({
  fields,
  onChange
}: {
  fields: HouseGoalFields;
  onChange: (fields: HouseGoalFields) => void;
}) {
  const patch = (updates: Partial<HouseGoalFields>) => {
    onChange({ ...fields, ...updates });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-normal">House Calculator</h2>
        <Badge variant="muted">
          {formatMoney(estimateHousePaymentCents(fields))} / month
        </Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Purchase price">
          <MoneyInput
            valueCents={fields.purchasePriceCents}
            onChange={(value) => patch({ purchasePriceCents: value })}
          />
        </Field>
        <Field label="Down payment">
          <PercentInput
            value={fields.downPaymentPercent}
            onChange={(value) => patch({ downPaymentPercent: value })}
          />
        </Field>
        <Field label="Closing costs">
          <PercentInput
            value={fields.closingCostPercent}
            onChange={(value) => patch({ closingCostPercent: value })}
          />
        </Field>
        <Field label="Interest rate">
          <PercentInput
            value={fields.interestRatePercent}
            onChange={(value) => patch({ interestRatePercent: value })}
          />
        </Field>
        <Field label="Loan term">
          <Input
            min="1"
            step="1"
            type="number"
            value={fields.loanTermYears}
            onChange={(event) =>
              patch({ loanTermYears: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field label="Property tax">
          <PercentInput
            value={fields.annualPropertyTaxPercent}
            onChange={(value) => patch({ annualPropertyTaxPercent: value })}
          />
        </Field>
        <Field label="Insurance">
          <MoneyInput
            valueCents={fields.monthlyInsuranceCents}
            onChange={(value) => patch({ monthlyInsuranceCents: value })}
          />
        </Field>
        <Field label="HOA">
          <MoneyInput
            valueCents={fields.monthlyHoaCents}
            onChange={(value) => patch({ monthlyHoaCents: value })}
          />
        </Field>
      </div>
    </div>
  );
}

function PercentInput({
  onChange,
  value
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <Input
      max="100"
      min="0"
      step="0.1"
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  );
}

function ResultPill({
  label,
  value,
  status
}: {
  label: string;
  value: string;
  status?: "success" | "danger";
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold",
          status === "success" && "text-emerald-700",
          status === "danger" && "text-rose-700"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function defaultHouseFields(): HouseGoalFields {
  return {
    purchasePriceCents: 35000000,
    downPaymentPercent: 15,
    closingCostPercent: 3,
    interestRatePercent: 6.5,
    loanTermYears: 30,
    annualPropertyTaxPercent: 0.75,
    monthlyInsuranceCents: 17500,
    monthlyHoaCents: 0
  };
}
