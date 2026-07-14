import { ArrowLeft, ChevronRight, Copy, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  MoneyVariableField,
  PercentVariableField
} from "../components/VariableField";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { createId } from "../domain/ids";
import { formatMoney, formatPercent } from "../domain/money";
import {
  calculateHouseAmortization,
  getGoalScenarioType,
  projectPlan,
  requiredCashForGoalScenario
} from "../domain/projection";
import type {
  Goal,
  GoalScenario,
  GoalType,
  HouseGoalFields
} from "../domain/types";
import { isSameDraft } from "../lib/draft";
import { cn } from "../lib/utils";
import { usePlannerStore } from "../store/plannerStore";

export function GoalsPage() {
  const { plan, updatePlan } = usePlannerStore();
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [draftGoal, setDraftGoal] = useState<Goal | null>(null);
  const projection = useMemo(() => (plan ? projectPlan(plan) : null), [plan]);

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (selectedGoalId && !plan.goals.some((goal) => goal.id === selectedGoalId)) {
      setSelectedGoalId("");
      setSelectedScenarioId("");
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

  const selectedGoal = plan?.goals.find((goal) => goal.id === selectedGoalId);

  useEffect(() => {
    setDraftGoal(selectedGoal ? structuredClone(selectedGoal) : null);
  }, [selectedGoal]);

  if (!plan || !projection) {
    return null;
  }

  const selectedScenario = draftGoal?.scenarios.find(
    (scenario) => scenario.id === selectedScenarioId
  );
  const selectedScenarioType = selectedScenario
    ? getGoalScenarioType(selectedScenario)
    : "other";
  const selectedResult = projection.goalResults.find(
    (result) =>
      result.goalId === selectedGoal?.id &&
      result.scenarioId === selectedScenario?.id
  );
  const hasUnsavedChanges =
    Boolean(selectedGoal && draftGoal) && !isSameDraft(selectedGoal, draftGoal);

  const updateDraftGoal = (updater: (goal: Goal) => void) => {
    setDraftGoal((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      updater(next);
      return next;
    });
  };

  const updateDraftScenario = (
    scenarioId: string,
    updater: (scenario: GoalScenario) => void
  ) => {
    updateDraftGoal((goal) => {
      const scenario = goal.scenarios.find((item) => item.id === scenarioId);
      if (scenario) {
        updater(scenario);
      }
    });
  };

  const saveGoal = () => {
    if (!draftGoal) {
      return;
    }
    void updatePlan((draft) => {
      const index = draft.goals.findIndex((goal) => goal.id === draftGoal.id);
      if (index >= 0) {
        draft.goals[index] = normalizeGoalForSave(draftGoal);
      }
      return draft;
    });
  };

  const addGoal = () => {
    const goalId = createId("goal");
    const scenarioId = createId("goal_scenario");
    void updatePlan((draft) => {
      draft.goals.push({
        id: goalId,
        name: "New goal",
        contributedFromSavingsCents: 0,
        notes: "",
        scenarios: [
          {
            id: scenarioId,
            name: "Base",
            type: "other",
            targetDate: "2030-01-01",
            targetAmountCents: 5000000
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
    setSelectedGoalId("");
    setSelectedScenarioId("");
  };

  const addScenario = () => {
    if (!draftGoal) {
      return;
    }
    const scenarioId = createId("goal_scenario");
    updateDraftGoal((goal) => {
      const source = goal.scenarios[0];
      const sourceType = source ? getGoalScenarioType(source) : "other";
      const scenario: GoalScenario = {
        id: scenarioId,
        name: "New scenario",
        type: sourceType,
        targetDate: source?.targetDate ?? "2030-01-01",
        targetAmountCents: source?.targetAmountCents ?? 5000000
      };
      if (sourceType === "house") {
        scenario.house = structuredClone(source?.house ?? defaultHouseFields());
      }
      goal.scenarios.push(scenario);
    });
    setSelectedScenarioId(scenarioId);
  };

  const duplicateScenario = () => {
    if (!draftGoal || !selectedScenario) {
      return;
    }
    const scenarioId = createId("goal_scenario");
    const scenarioType = getGoalScenarioType(selectedScenario);
    updateDraftGoal((goal) => {
      const scenario: GoalScenario = {
        ...structuredClone(selectedScenario),
        id: scenarioId,
        name: `${selectedScenario.name} copy`,
        type: scenarioType
      };
      if (scenarioType === "house") {
        scenario.house = scenario.house ?? defaultHouseFields();
      } else {
        delete scenario.house;
      }
      goal.scenarios.push(scenario);
    });
    setSelectedScenarioId(scenarioId);
  };

  const deleteScenario = () => {
    if (!draftGoal || !selectedScenario || draftGoal.scenarios.length <= 1) {
      return;
    }
    updateDraftGoal((goal) => {
      goal.scenarios = goal.scenarios.filter(
        (scenario) => scenario.id !== selectedScenario.id
      );
    });
    const fallback = draftGoal.scenarios.find(
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
          selectedGoal && draftGoal && selectedScenario ? (
            <>
              <Button
                onClick={() => {
                  setSelectedGoalId("");
                  setSelectedScenarioId("");
                }}
                type="button"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button
                disabled={!draftGoal}
                onClick={addScenario}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Scenario
              </Button>
              {hasUnsavedChanges ? (
                <Badge variant="warning">Unsaved</Badge>
              ) : null}
            </>
          ) : (
            <Button onClick={addGoal} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Goal
            </Button>
          )
        }
      />

      {selectedGoal && draftGoal && selectedScenario ? (
        <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{draftGoal.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Goal name">
                    <Input
                      value={draftGoal.name}
                      onChange={(event) =>
                        updateDraftGoal((goal) => {
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
                      {draftGoal.scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Contributed from savings">
                    <MoneyVariableField
                      path={{
                        scope: "goal",
                        goalId: draftGoal.id,
                        field: "contributedFromSavingsCents"
                      }}
                      suggestedName={`${draftGoal.name} contribution`}
                      valueCents={draftGoal.contributedFromSavingsCents ?? 0}
                      onChange={(value) =>
                        updateDraftGoal((goal) => {
                          goal.contributedFromSavingsCents = value;
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <Textarea
                    value={draftGoal.notes ?? ""}
                    onChange={(event) =>
                      updateDraftGoal((goal) => {
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
                    disabled={draftGoal.scenarios.length <= 1}
                    onClick={deleteScenario}
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete Scenario
                  </Button>
                  <Button
                    disabled={!hasUnsavedChanges}
                    onClick={() =>
                      setDraftGoal(selectedGoal ? structuredClone(selectedGoal) : null)
                    }
                    type="button"
                    variant="outline"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    Discard
                  </Button>
                  <Button
                    disabled={!hasUnsavedChanges}
                    onClick={saveGoal}
                    type="button"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save
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
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Scenario name">
                    <Input
                      value={selectedScenario.name}
                      onChange={(event) =>
                        updateDraftScenario(
                          selectedScenario.id,
                          (scenario) => {
                            scenario.name = event.target.value;
                          }
                        )
                      }
                    />
                  </Field>
                  <Field label="Goal type">
                    <Select
                      value={selectedScenarioType}
                      onChange={(event) => {
                        const nextType = event.target.value as GoalType;
                        updateDraftScenario(
                          selectedScenario.id,
                          (scenario) => {
                            scenario.type = nextType;
                            if (nextType === "house") {
                              scenario.house =
                                scenario.house ?? defaultHouseFields();
                            } else {
                              delete scenario.house;
                            }
                          }
                        );
                      }}
                    >
                      <option value="house">House</option>
                      <option value="other">Custom</option>
                    </Select>
                  </Field>
                  <Field label="Target date">
                    <Input
                      type="date"
                      value={selectedScenario.targetDate}
                      onChange={(event) =>
                        updateDraftScenario(
                          selectedScenario.id,
                          (scenario) => {
                            scenario.targetDate = event.target.value;
                          }
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={
                      selectedScenarioType === "house"
                        ? "Cash floor"
                        : "Goal amount"
                    }
                  >
                    <MoneyVariableField
                      path={{
                        scope: "goalScenario",
                        goalId: draftGoal.id,
                        scenarioId: selectedScenario.id,
                        field: "targetAmountCents"
                      }}
                      suggestedName={`${selectedScenario.name} target`}
                      valueCents={selectedScenario.targetAmountCents}
                      onChange={(value) =>
                        updateDraftScenario(
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

                {selectedScenarioType === "house" ? (
                  <HouseFields
                    fields={selectedScenario.house ?? defaultHouseFields()}
                    goalId={draftGoal.id}
                    scenarioId={selectedScenario.id}
                    onChange={(house) =>
                      updateDraftScenario(
                        selectedScenario.id,
                        (scenario) => {
                          scenario.type = "house";
                          scenario.house = house;
                        }
                      )
                    }
                  />
                ) : (
                  <CustomGoalFields scenario={selectedScenario} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feasibility</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedResult ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ResultPill
                      label="Funded"
                      value={formatPercent(Math.round(selectedResult.percentFunded))}
                    />
                    <ResultPill
                      label="Contributed"
                      value={formatMoney(
                        selectedResult.contributedFromSavingsCents
                      )}
                    />
                    <ResultPill
                      label="Available"
                      value={formatMoney(selectedResult.availableCashCents)}
                    />
                    {selectedResult.availableDownPaymentCents !== undefined ? (
                      <ResultPill
                        label="Affordable down payment"
                        value={formatMoney(
                          selectedResult.availableDownPaymentCents
                        )}
                        detail={
                          selectedResult.availableDownPaymentPercent !== undefined
                            ? formatPercent(
                                selectedResult.availableDownPaymentPercent
                              )
                            : undefined
                        }
                      />
                    ) : null}
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
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Goal</th>
                    <th className="px-4 py-3 font-medium">Scenarios</th>
                    <th className="px-4 py-3 font-medium">Target date</th>
                    <th className="px-4 py-3 font-medium">Funded</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {plan.goals.map((goal) => {
                    const firstScenario = goal.scenarios[0];
                    const result = projection.goalResults.find(
                      (item) =>
                        item.goalId === goal.id &&
                        item.scenarioId === firstScenario?.id
                    );
                    return (
                      <tr
                        className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                        key={goal.id}
                        onClick={() => {
                          setSelectedGoalId(goal.id);
                          setSelectedScenarioId(goal.scenarios[0]?.id ?? "");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedGoalId(goal.id);
                            setSelectedScenarioId(goal.scenarios[0]?.id ?? "");
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td className="px-4 py-3 font-medium">{goal.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {goal.scenarios.length} scenario
                          {goal.scenarios.length === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-3">
                          {firstScenario?.targetDate ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          {result
                            ? formatPercent(Math.round(result.percentFunded))
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight
                            className="ml-auto h-4 w-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function normalizeGoalForSave(goal: Goal): Goal {
  const normalizedGoal = structuredClone(goal);
  normalizedGoal.scenarios = normalizedGoal.scenarios.map((scenario) => {
    const scenarioType = getGoalScenarioType(scenario);
    const normalizedScenario: GoalScenario = {
      ...scenario,
      type: scenarioType
    };

    if (scenarioType === "house") {
      normalizedScenario.house =
        normalizedScenario.house ?? defaultHouseFields();
    } else {
      delete normalizedScenario.house;
    }

    return normalizedScenario;
  });

  return normalizedGoal;
}

function CustomGoalFields({ scenario }: { scenario: GoalScenario }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-normal">Custom Goal</h2>
        <Badge variant="muted">Custom</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ResultPill
          label="Target cash"
          value={formatMoney(scenario.targetAmountCents)}
        />
        <ResultPill
          label="Required cash"
          value={formatMoney(requiredCashForGoalScenario(scenario))}
        />
      </div>
    </div>
  );
}

function HouseFields({
  fields,
  goalId,
  scenarioId,
  onChange
}: {
  fields: HouseGoalFields;
  goalId: string;
  scenarioId: string;
  onChange: (fields: HouseGoalFields) => void;
}) {
  const amortization = calculateHouseAmortization(fields);
  const schedulePreview = amortization.schedule.slice(0, 12);
  const patch = (updates: Partial<HouseGoalFields>) => {
    onChange({ ...fields, ...updates });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-normal">House Calculator</h2>
        <Badge variant="muted">
          {formatMoney(amortization.totalMonthlyPaymentCents)} / month
        </Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Purchase price">
          <MoneyVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "purchasePriceCents"
            }}
            suggestedName="Purchase price"
            valueCents={fields.purchasePriceCents}
            onChange={(value) => patch({ purchasePriceCents: value })}
          />
        </Field>
        <Field label="Down payment">
          <PercentVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "downPaymentPercent"
            }}
            suggestedName="Down payment %"
            value={fields.downPaymentPercent}
            onChange={(value) => patch({ downPaymentPercent: value })}
          />
        </Field>
        <Field label="Closing costs">
          <PercentVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "closingCostPercent"
            }}
            suggestedName="Closing costs %"
            value={fields.closingCostPercent}
            onChange={(value) => patch({ closingCostPercent: value })}
          />
        </Field>
        <Field label="Interest rate">
          <PercentVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "interestRatePercent"
            }}
            suggestedName="Interest rate %"
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
          <PercentVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "annualPropertyTaxPercent"
            }}
            suggestedName="Property tax %"
            value={fields.annualPropertyTaxPercent}
            onChange={(value) => patch({ annualPropertyTaxPercent: value })}
          />
        </Field>
        <Field label="Insurance">
          <MoneyVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "monthlyInsuranceCents"
            }}
            suggestedName="Monthly insurance"
            valueCents={fields.monthlyInsuranceCents}
            onChange={(value) => patch({ monthlyInsuranceCents: value })}
          />
        </Field>
        <Field label="HOA">
          <MoneyVariableField
            path={{
              scope: "houseField",
              goalId,
              scenarioId,
              field: "monthlyHoaCents"
            }}
            suggestedName="Monthly HOA"
            valueCents={fields.monthlyHoaCents}
            onChange={(value) => patch({ monthlyHoaCents: value })}
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ResultPill
          label="Loan amount"
          value={formatMoney(amortization.loanPrincipalCents)}
        />
        <ResultPill
          label="Principal + interest"
          value={formatMoney(amortization.monthlyPrincipalInterestCents)}
        />
        <ResultPill
          label="Property tax"
          value={formatMoney(amortization.monthlyPropertyTaxCents)}
        />
        <ResultPill
          label="First-year interest"
          value={formatMoney(amortization.firstYearInterestCents)}
        />
        <ResultPill
          label="Total interest"
          value={formatMoney(amortization.totalInterestCents)}
        />
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-normal">Amortization</h3>
          <Badge variant="muted">{amortization.payoffMonths} payments</Badge>
        </div>
        <div className="max-h-[360px] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Principal</th>
                <th className="px-3 py-2 font-medium">Interest</th>
                <th className="px-3 py-2 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedulePreview.map((row) => (
                <tr className="border-t border-border" key={row.monthNumber}>
                  <td className="px-3 py-2 font-medium">{row.monthNumber}</td>
                  <td className="px-3 py-2">{formatMoney(row.paymentCents)}</td>
                  <td className="px-3 py-2">
                    {formatMoney(row.principalCents)}
                  </td>
                  <td className="px-3 py-2">{formatMoney(row.interestCents)}</td>
                  <td className="px-3 py-2">
                    {formatMoney(row.remainingPrincipalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResultPill({
  detail,
  label,
  value,
  status
}: {
  detail?: string;
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
      {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
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
