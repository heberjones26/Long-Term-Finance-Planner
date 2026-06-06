import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/field";
import { createId } from "../domain/ids";
import { dollarsToCents, formatMoney } from "../domain/money";
import { normalizedMonthlyCents } from "../domain/projection";
import type { CostOfLivingScenario } from "../domain/types";
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
  const categoryTotals = useMemo(
    () => getCategoryTotals(selectedScenario),
    [selectedScenario]
  );
  const monthlyTotal = categoryTotals.reduce(
    (total, category) => total + category.amountCents,
    0
  );

  if (!plan || !selectedScenario) {
    return null;
  }

  const updateScenario = (
    scenarioId: string,
    updater: (scenario: CostOfLivingScenario) => void
  ) => {
    void updatePlan((draft) => {
      const scenario = draft.costOfLivingScenarios.find(
        (item) => item.id === scenarioId
      );
      if (scenario) {
        updater(scenario);
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
      const source = draft.costOfLivingScenarios.find(
        (scenario) => scenario.id === selectedScenario.id
      );
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
    updateScenario(selectedScenario.id, (scenario) => {
      scenario.items.push({
        id: createId("cost"),
        name: values.name.trim(),
        category: values.category.trim() || "Uncategorized",
        amountCents,
        cadence: values.cadence
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
              <CardTitle>{selectedScenario.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Scenario name">
                  <Input
                    value={selectedScenario.name}
                    onChange={(event) =>
                      updateScenario(selectedScenario.id, (scenario) => {
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
                  value={selectedScenario.notes ?? ""}
                  onChange={(event) =>
                    updateScenario(selectedScenario.id, (scenario) => {
                      scenario.notes = event.target.value;
                    })
                  }
                />
              </Field>
              <div className="flex justify-end">
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
                className="grid gap-3 md:grid-cols-[1fr_1fr_140px_140px_auto]"
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
                    min="0"
                    placeholder="0.00"
                    step="0.01"
                    type="number"
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

              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full min-w-[660px] text-sm">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Cadence</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Monthly</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedScenario.items.map((item) => (
                      <tr className="border-t border-border" key={item.id}>
                        <td className="px-3 py-2 font-medium">{item.name}</td>
                        <td className="px-3 py-2">{item.category}</td>
                        <td className="px-3 py-2 capitalize">{item.cadence}</td>
                        <td className="px-3 py-2">
                          {formatMoney(item.amountCents)}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(
                            normalizedMonthlyCents(item.amountCents, item.cadence)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            aria-label={`Delete ${item.name}`}
                            onClick={() =>
                              updateScenario(selectedScenario.id, (scenario) => {
                                scenario.items = scenario.items.filter(
                                  (candidate) => candidate.id !== item.id
                                );
                              })
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    ))}
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

function getCategoryTotals(scenario: CostOfLivingScenario | undefined) {
  if (!scenario) {
    return [];
  }
  const totals = new Map<string, number>();
  scenario.items.forEach((item) => {
    const monthlyCents = normalizedMonthlyCents(item.amountCents, item.cadence);
    totals.set(item.category, (totals.get(item.category) ?? 0) + monthlyCents);
  });
  return [...totals.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
}
