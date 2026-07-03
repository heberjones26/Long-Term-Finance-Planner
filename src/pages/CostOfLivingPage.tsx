import { Copy, Pencil, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { MoneyInput } from "../components/MoneyInput";
import { PageHeader } from "../components/PageHeader";
import { PillToggle } from "../components/PillToggle";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { createId } from "../domain/ids";
import { dollarsToCents, formatMoney } from "../domain/money";
import { normalizedMonthlyCents } from "../domain/projection";
import type { CostItem, CostOfLivingScenario } from "../domain/types";
import { isSameDraft } from "../lib/draft";
import { cn } from "../lib/utils";
import { usePlannerStore } from "../store/plannerStore";

type CostItemForm = {
  name: string;
  category: string;
  amount: string;
  cadence: "monthly" | "yearly";
};

export function CostOfLivingPage() {
  const { plan, updatePlan } = usePlannerStore();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [draftScenario, setDraftScenario] =
    useState<CostOfLivingScenario | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const { handleSubmit, register, reset } = useForm<CostItemForm>({
    defaultValues: {
      name: "",
      category: "Housing",
      amount: "",
      cadence: "monthly"
    }
  });

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (
      !selectedScenarioId ||
      !plan.costOfLivingScenarios.some(
        (scenario) => scenario.id === selectedScenarioId
      )
    ) {
      setSelectedScenarioId(plan.costOfLivingScenarios[0]?.id ?? "");
    }
  }, [plan, selectedScenarioId]);

  const selectedScenario = plan?.costOfLivingScenarios.find(
    (scenario) => scenario.id === selectedScenarioId
  );
  useEffect(() => {
    setDraftScenario(selectedScenario ? structuredClone(selectedScenario) : null);
    setEditingItemId(null);
  }, [selectedScenario]);

  const categoryTotals = useMemo(
    () => getCategoryTotals(draftScenario),
    [draftScenario]
  );
  const monthlyTotal = categoryTotals.reduce(
    (total, category) => total + category.amountCents,
    0
  );

  if (!plan || !selectedScenario || !draftScenario) {
    return null;
  }

  const hasUnsavedChanges = !isSameDraft(selectedScenario, draftScenario);

  const updateDraftScenario = (updater: (scenario: CostOfLivingScenario) => void) => {
    setDraftScenario((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      updater(next);
      return next;
    });
  };

  const updateCostItem = (
    itemId: string,
    updater: (item: CostItem) => void
  ) => {
    updateDraftScenario((scenario) => {
      const item = scenario.items.find((candidate) => candidate.id === itemId);
      if (item) {
        updater(item);
      }
    });
  };

  const saveScenario = () => {
    void updatePlan((draft) => {
      const index = draft.costOfLivingScenarios.findIndex(
        (scenario) => scenario.id === draftScenario.id
      );
      if (index >= 0) {
        draft.costOfLivingScenarios[index] = structuredClone(draftScenario);
      }
      return draft;
    });
  };

  const addScenario = () => {
    const scenarioId = createId("col");
    void updatePlan((draft) => {
      draft.costOfLivingScenarios.push({
        id: scenarioId,
        name: "New scenario",
        notes: "",
        items: []
      });
      return draft;
    });
    setSelectedScenarioId(scenarioId);
  };

  const duplicateScenario = () => {
    const scenarioId = createId("col");
    void updatePlan((draft) => {
      const source = draftScenario;
      if (source) {
        draft.costOfLivingScenarios.push({
          ...structuredClone(source),
          id: scenarioId,
          name: `${source.name} copy`,
          items: source.items.map((item) => ({ ...item, id: createId("cost") }))
        });
      }
      return draft;
    });
    setSelectedScenarioId(scenarioId);
  };

  const deleteScenario = () => {
    if (plan.costOfLivingScenarios.length <= 1) {
      return;
    }
    const fallback = plan.costOfLivingScenarios.find(
      (scenario) => scenario.id !== selectedScenario.id
    );
    if (!fallback) {
      return;
    }
    void updatePlan((draft) => {
      draft.costOfLivingScenarios = draft.costOfLivingScenarios.filter(
        (scenario) => scenario.id !== selectedScenario.id
      );
      draft.periods.forEach((period) => {
        if (period.costOfLivingScenarioId === selectedScenario.id) {
          period.costOfLivingScenarioId = fallback.id;
        }
      });
      return draft;
    });
    setSelectedScenarioId(fallback.id);
  };

  const onAddItem = handleSubmit((values) => {
    const amountCents = dollarsToCents(values.amount);
    if (!values.name.trim() || amountCents <= 0) {
      return;
    }
    updateDraftScenario((scenario) => {
      scenario.items.push({
        id: createId("cost"),
        name: values.name.trim(),
        category: values.category.trim() || "Uncategorized",
        amountCents,
        cadence: values.cadence,
        enabled: true
      });
    });
    reset({
      name: "",
      category: values.category,
      amount: "",
      cadence: values.cadence
    });
  });

  return (
    <div>
      <PageHeader
        eyebrow="Scenario Library"
        title="Cost of Living"
        actions={
          <>
            <Button onClick={addScenario} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Scenario
            </Button>
            <Button onClick={duplicateScenario} type="button" variant="outline">
              <Copy className="h-4 w-4" aria-hidden="true" />
              Duplicate
            </Button>
            {hasUnsavedChanges ? <Badge variant="warning">Unsaved</Badge> : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {plan.costOfLivingScenarios.map((scenario) => {
            const total = getCategoryTotals(scenario).reduce(
              (sum, category) => sum + category.amountCents,
              0
            );
            const selected = scenario.id === selectedScenario.id;
            return (
              <button
                className={cn(
                  "w-full rounded-md border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary",
                  selected && "border-primary bg-primary/5"
                )}
                key={scenario.id}
                onClick={() => setSelectedScenarioId(scenario.id)}
                type="button"
              >
                <p className="font-medium">{scenario.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatMoney(total)} / month
                </p>
              </button>
            );
          })}
        </aside>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{draftScenario.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Scenario name">
                  <Input
                    value={draftScenario.name}
                    onChange={(event) =>
                      updateDraftScenario((scenario) => {
                        scenario.name = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Normalized monthly total">
                  <Input readOnly value={formatMoney(monthlyTotal)} />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea
                  value={draftScenario.notes ?? ""}
                  onChange={(event) =>
                    updateDraftScenario((scenario) => {
                      scenario.notes = event.target.value;
                    })
                  }
                />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={!hasUnsavedChanges}
                  onClick={() => {
                    setDraftScenario(structuredClone(selectedScenario));
                    setEditingItemId(null);
                  }}
                  type="button"
                  variant="outline"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Discard
                </Button>
                <Button
                  disabled={!hasUnsavedChanges}
                  onClick={saveScenario}
                  type="button"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save
                </Button>
                <Button
                  disabled={plan.costOfLivingScenarios.length <= 1}
                  onClick={deleteScenario}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete Scenario
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expense Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <form
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_1fr_140px_140px_auto]"
                onSubmit={onAddItem}
              >
                <Field label="Name">
                  <Input placeholder="Rent" {...register("name")} />
                </Field>
                <Field label="Category">
                  <Input placeholder="Housing" {...register("category")} />
                </Field>
                <Field label="Amount">
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    type="text"
                    {...register("amount")}
                  />
                </Field>
                <Field label="Cadence">
                  <Select {...register("cadence")}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Button className="w-full" type="submit">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[940px] text-sm">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="w-24 px-3 py-2 font-medium">Included</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Cadence</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Monthly</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {draftScenario.items.map((item) => {
                      const enabled = item.enabled !== false;
                      const isEditing = editingItemId === item.id;
                      const normalizedCents = normalizedMonthlyCents(
                        item.amountCents,
                        item.cadence
                      );

                      return (
                        <tr
                          className={cn(
                            "border-t border-border",
                            !enabled && "bg-muted/30 text-muted-foreground"
                          )}
                          key={item.id}
                        >
                          <td className="px-3 py-2">
                            <PillToggle
                              checked={enabled}
                              label={`${item.name} included in totals`}
                              onChange={(checked) =>
                                updateCostItem(item.id, (draftItem) => {
                                  draftItem.enabled = checked;
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <Input
                                aria-label={`Name for ${item.name}`}
                                className="min-w-40"
                                value={item.name}
                                onChange={(event) =>
                                  updateCostItem(item.id, (draftItem) => {
                                    draftItem.name = event.target.value;
                                  })
                                }
                              />
                            ) : (
                              <span className="font-medium">{item.name}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <Input
                                aria-label={`Category for ${item.name}`}
                                className="min-w-36"
                                value={item.category}
                                onChange={(event) =>
                                  updateCostItem(item.id, (draftItem) => {
                                    draftItem.category = event.target.value;
                                  })
                                }
                              />
                            ) : (
                              item.category
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <Select
                                aria-label={`Cadence for ${item.name}`}
                                className="min-w-28"
                                value={item.cadence}
                                onChange={(event) =>
                                  updateCostItem(item.id, (draftItem) => {
                                    draftItem.cadence = event.target
                                      .value as CostItem["cadence"];
                                  })
                                }
                              >
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                              </Select>
                            ) : (
                              <span className="capitalize">{item.cadence}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <MoneyInput
                                aria-label={`Amount for ${item.name}`}
                                className="min-w-28"
                                valueCents={item.amountCents}
                                onChange={(value) =>
                                  updateCostItem(item.id, (draftItem) => {
                                    draftItem.amountCents = Math.max(value, 0);
                                  })
                                }
                              />
                            ) : (
                              formatMoney(item.amountCents)
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {formatMoney(enabled ? normalizedCents : 0)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                aria-label={
                                  isEditing
                                    ? `Done editing ${item.name}`
                                    : `Edit ${item.name}`
                                }
                                onClick={() =>
                                  setEditingItemId(isEditing ? null : item.id)
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {isEditing ? null : (
                                  <Pencil
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                {isEditing ? "Done" : "Edit"}
                              </Button>
                              <Button
                                aria-label={`Delete ${item.name}`}
                                onClick={() => {
                                  updateDraftScenario((scenario) => {
                                    scenario.items = scenario.items.filter(
                                      (candidate) => candidate.id !== item.id
                                    );
                                  });
                                  if (editingItemId === item.id) {
                                    setEditingItemId(null);
                                  }
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {categoryTotals.map((category) => (
                  <div
                    className="rounded-md border border-border bg-background p-4"
                    key={category.category}
                  >
                    <p className="text-sm text-muted-foreground">
                      {category.category}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatMoney(category.amountCents)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function getCategoryTotals(scenario: CostOfLivingScenario | null | undefined) {
  if (!scenario) {
    return [];
  }
  const totals = new Map<string, number>();
  scenario.items.forEach((item) => {
    if (item.enabled === false) {
      return;
    }
    const monthlyCents = normalizedMonthlyCents(item.amountCents, item.cadence);
    totals.set(item.category, (totals.get(item.category) ?? 0) + monthlyCents);
  });
  return [...totals.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
}
