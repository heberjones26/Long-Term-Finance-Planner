import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO
} from "date-fns";
import { CalendarPlus, Copy, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Select } from "../components/ui/field";
import { createId } from "../domain/ids";
import { dollarsToCents, formatMoney, formatPercent } from "../domain/money";
import { projectPlan } from "../domain/projection";
import { calculatePeriodTaxProfile, taxFilingStatusLabels } from "../domain/tax";
import type {
  Cadence,
  FinancialPeriod,
  RecurringMoneyItem,
  TaxFilingStatus
} from "../domain/types";
import { isSameDraft } from "../lib/draft";
import { cn } from "../lib/utils";
import { usePlannerStore } from "../store/plannerStore";

type PeriodItemForm = {
  name: string;
  category: string;
  amount: string;
  cadence: Cadence;
  date: string;
};

export function PeriodsPage() {
  const { plan, updatePlan } = usePlannerStore();
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [draftPeriod, setDraftPeriod] = useState<FinancialPeriod | null>(null);
  const projection = useMemo(() => (plan ? projectPlan(plan) : null), [plan]);

  const sortedPeriods = useMemo(
    () =>
      plan
        ? [...plan.periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
        : [],
    [plan]
  );

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (
      !selectedPeriodId ||
      !plan.periods.some((period) => period.id === selectedPeriodId)
    ) {
      setSelectedPeriodId(sortedPeriods[0]?.id ?? "");
    }
  }, [plan, selectedPeriodId, sortedPeriods]);

  const selectedPeriod = plan?.periods.find(
    (period) => period.id === selectedPeriodId
  );

  useEffect(() => {
    setDraftPeriod(selectedPeriod ? structuredClone(selectedPeriod) : null);
  }, [selectedPeriod]);

  const draftTaxProfile = useMemo(
    () => (draftPeriod ? calculatePeriodTaxProfile(draftPeriod) : null),
    [draftPeriod]
  );

  if (!plan || !projection) {
    return null;
  }

  const selectedSummary = projection.periodSummaries.find(
    (summary) => summary.periodId === selectedPeriodId
  );
  const hasUnsavedChanges =
    Boolean(selectedPeriod && draftPeriod) &&
    !isSameDraft(selectedPeriod, draftPeriod);

  const updateDraftPeriod = (updater: (period: FinancialPeriod) => void) => {
    setDraftPeriod((current) => {
      if (!current) {
        return current;
      }
      const next = structuredClone(current);
      updater(next);
      return next;
    });
  };

  const savePeriod = () => {
    if (!draftPeriod) {
      return;
    }
    void updatePlan((draft) => {
      const index = draft.periods.findIndex((item) => item.id === draftPeriod.id);
      if (index >= 0) {
        draft.periods[index] = structuredClone(draftPeriod);
      }
      return draft;
    });
  };

  const addPeriod = () => {
    const periodId = createId("period");
    const latestPeriod = sortedPeriods.at(-1);
    const startDate = latestPeriod
      ? format(addDays(parseISO(latestPeriod.endDate), 1), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-01");
    const endDate = format(addMonths(parseISO(startDate), 3), "yyyy-MM-dd");
    void updatePlan((draft) => {
      draft.periods.push({
        id: periodId,
        name: "New period",
        startDate,
        endDate,
        costOfLivingScenarioId: draft.costOfLivingScenarios[0]?.id ?? "",
        grossIncomeItems: [],
        extraExpenseItems: [],
        effectiveTaxRate: 0,
        taxFilingStatus: "single",
        additionalTaxRate: 0,
        savingsRate: 0,
        charityRate: 0
      });
      return draft;
    });
    setSelectedPeriodId(periodId);
  };

  const duplicatePeriod = () => {
    if (!draftPeriod) {
      return;
    }

    const periodId = createId("period");
    const sourceStart = parseLocalDate(draftPeriod.startDate);
    const sourceEnd = parseLocalDate(draftPeriod.endDate);
    const latestEnd = parseLocalDate(sortedPeriods.at(-1)?.endDate);
    const newStart = latestEnd
      ? addDays(latestEnd, 1)
      : sourceStart ?? parseISO(format(new Date(), "yyyy-MM-01"));
    const sourceLengthDays =
      sourceStart && sourceEnd
        ? Math.max(0, differenceInCalendarDays(sourceEnd, sourceStart))
        : null;
    const newEnd =
      sourceLengthDays !== null
        ? addDays(newStart, sourceLengthDays)
        : addMonths(newStart, 3);
    const dateOffsetDays = sourceStart
      ? differenceInCalendarDays(newStart, sourceStart)
      : 0;
    const copiedPeriod: FinancialPeriod = {
      ...structuredClone(draftPeriod),
      id: periodId,
      name: `${draftPeriod.name} copy`,
      startDate: format(newStart, "yyyy-MM-dd"),
      endDate: format(newEnd, "yyyy-MM-dd"),
      grossIncomeItems: draftPeriod.grossIncomeItems.map((item) =>
        duplicateMoneyItem(item, "income", dateOffsetDays)
      ),
      extraExpenseItems: draftPeriod.extraExpenseItems.map((item) =>
        duplicateMoneyItem(item, "expense", dateOffsetDays)
      )
    };

    void updatePlan((draft) => {
      draft.periods.push(copiedPeriod);
      return draft;
    });
    setSelectedPeriodId(periodId);
  };

  const deletePeriod = () => {
    if (!selectedPeriod) {
      return;
    }
    void updatePlan((draft) => {
      draft.periods = draft.periods.filter(
        (period) => period.id !== selectedPeriod.id
      );
      return draft;
    });
    const fallback = sortedPeriods.find((period) => period.id !== selectedPeriod.id);
    setSelectedPeriodId(fallback?.id ?? "");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Timeline"
        title="Periods"
        actions={
          <>
            <Button onClick={addPeriod} type="button">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Period
            </Button>
            <Button
              disabled={!draftPeriod}
              onClick={duplicatePeriod}
              type="button"
              variant="outline"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Duplicate
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {sortedPeriods.map((period) => {
            const scenario = plan.costOfLivingScenarios.find(
              (item) => item.id === period.costOfLivingScenarioId
            );
            const selected = period.id === selectedPeriodId;
            return (
              <button
                className={cn(
                  "w-full rounded-md border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary",
                  selected && "border-primary bg-primary/5"
                )}
                key={period.id}
                onClick={() => setSelectedPeriodId(period.id)}
                type="button"
              >
                <p className="font-medium">{period.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {period.startDate} to {period.endDate}
                </p>
                <Badge className="mt-3" variant="muted">
                  {scenario?.name ?? "Missing COL"}
                </Badge>
              </button>
            );
          })}
        </aside>

        {selectedPeriod && draftPeriod ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{draftPeriod.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Period name">
                    <Input
                      value={draftPeriod.name}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.name = event.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field label="Cost of living">
                    <Select
                      value={draftPeriod.costOfLivingScenarioId}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.costOfLivingScenarioId = event.target.value;
                        })
                      }
                    >
                      {plan.costOfLivingScenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Start date">
                    <Input
                      type="date"
                      value={draftPeriod.startDate}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.startDate = event.target.value;
                        })
                      }
                    />
                  </Field>
                  <Field label="End date">
                    <Input
                      type="date"
                      value={draftPeriod.endDate}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.endDate = event.target.value;
                        })
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Filing status">
                    <Select
                      value={draftPeriod.taxFilingStatus ?? "single"}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.taxFilingStatus = event.target
                            .value as TaxFilingStatus;
                        })
                      }
                    >
                      {Object.entries(taxFilingStatusLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </Select>
                  </Field>
                  <Field label="State/local estimate">
                    <Input
                      max="100"
                      min="0"
                      step="0.1"
                      type="number"
                      value={draftPeriod.additionalTaxRate ?? 0}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.additionalTaxRate = Number(event.target.value);
                        })
                      }
                    />
                  </Field>
                  <Field label="Calculated tax rate">
                    <Input
                      readOnly
                      value={
                        draftTaxProfile
                          ? formatPercent(draftTaxProfile.calculatedTaxRate)
                          : "0%"
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Savings rate">
                    <Input
                      max="100"
                      min="0"
                      step="0.1"
                      type="number"
                      value={draftPeriod.savingsRate}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.savingsRate = Number(event.target.value);
                        })
                      }
                    />
                  </Field>
                  <Field label="Charity rate">
                    <Input
                      max="100"
                      min="0"
                      step="0.1"
                      type="number"
                      value={draftPeriod.charityRate}
                      onChange={(event) =>
                        updateDraftPeriod((period) => {
                          period.charityRate = Number(event.target.value);
                        })
                      }
                    />
                  </Field>
                </div>

                {selectedSummary ? (
                  <div className="grid gap-3 md:grid-cols-5">
                    <SummaryPill
                      label="Carryover in"
                      value={formatMoney(selectedSummary.carryoverInCents)}
                    />
                    <SummaryPill
                      label="Taxes"
                      value={formatMoney(selectedSummary.taxCents)}
                    />
                    <SummaryPill
                      label="Annualized gross"
                      value={formatMoney(selectedSummary.annualizedGrossIncomeCents)}
                    />
                    <SummaryPill
                      label="Spendable end"
                      value={formatMoney(selectedSummary.spendableEndingCents)}
                    />
                    <SummaryPill
                      label="Savings end"
                      value={formatMoney(selectedSummary.savingsEndingCents)}
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  {hasUnsavedChanges ? <Badge variant="warning">Unsaved</Badge> : null}
                  <Button
                    disabled={!hasUnsavedChanges}
                    onClick={() => setDraftPeriod(structuredClone(selectedPeriod))}
                    type="button"
                    variant="outline"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    Discard
                  </Button>
                  <Button
                    disabled={!hasUnsavedChanges}
                    onClick={savePeriod}
                    type="button"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save
                  </Button>
                  <Button
                    disabled={plan.periods.length <= 1}
                    onClick={deletePeriod}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete Period
                  </Button>
                </div>
              </CardContent>
            </Card>

            <PeriodItemSection
              items={draftPeriod.grossIncomeItems}
              onAdd={(item) =>
                updateDraftPeriod((period) => {
                  period.grossIncomeItems.push(item);
                })
              }
              onDelete={(itemId) =>
                updateDraftPeriod((period) => {
                  period.grossIncomeItems = period.grossIncomeItems.filter(
                    (item) => item.id !== itemId
                  );
                })
              }
              title="Gross Income"
            />

            <PeriodItemSection
              items={draftPeriod.extraExpenseItems}
              onAdd={(item) =>
                updateDraftPeriod((period) => {
                  period.extraExpenseItems.push(item);
                })
              }
              onDelete={(itemId) =>
                updateDraftPeriod((period) => {
                  period.extraExpenseItems = period.extraExpenseItems.filter(
                    (item) => item.id !== itemId
                  );
                })
              }
              title="Extra Expenses"
            />

            {projection.warnings.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>Timeline Warnings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {projection.warnings.map((warning) => (
                    <div
                      className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                      key={warning.id}
                    >
                      {warning.message}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function duplicateMoneyItem(
  item: RecurringMoneyItem,
  idPrefix: "expense" | "income",
  dateOffsetDays: number
): RecurringMoneyItem {
  const itemDate = parseLocalDate(item.date);

  return {
    ...structuredClone(item),
    id: createId(idPrefix),
    date:
      itemDate && item.cadence === "oneTime"
        ? format(addDays(itemDate, dateOffsetDays), "yyyy-MM-dd")
        : item.date
  };
}

function parseLocalDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function PeriodItemSection({
  items,
  onAdd,
  onDelete,
  title
}: {
  items: RecurringMoneyItem[];
  onAdd: (item: RecurringMoneyItem) => void;
  onDelete: (itemId: string) => void;
  title: string;
}) {
  const { handleSubmit, register, reset, watch } = useForm<PeriodItemForm>({
    defaultValues: {
      name: "",
      category: title === "Gross Income" ? "Work" : "Other",
      amount: "",
      cadence: "monthly",
      date: format(new Date(), "yyyy-MM-dd")
    }
  });
  const cadence = watch("cadence");

  const submit = handleSubmit((values) => {
    const amountCents = dollarsToCents(values.amount);
    if (!values.name.trim() || amountCents <= 0) {
      return;
    }
    onAdd({
      id: createId(title === "Gross Income" ? "income" : "expense"),
      name: values.name.trim(),
      category: values.category.trim() || "Other",
      amountCents,
      cadence: values.cadence,
      date: values.cadence === "oneTime" ? values.date : undefined
    });
    reset({
      name: "",
      category: values.category,
      amount: "",
      cadence: values.cadence,
      date: values.date
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_140px_150px_150px_auto]"
          onSubmit={submit}
        >
          <Field label="Name">
            <Input placeholder={title === "Gross Income" ? "Job" : "Books"} {...register("name")} />
          </Field>
          <Field label="Category">
            <Input placeholder="Category" {...register("category")} />
          </Field>
          <Field label="Amount">
            <Input
              inputMode="decimal"
              type="text"
              {...register("amount")}
            />
          </Field>
          <Field label="Cadence">
            <Select {...register("cadence")}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
              <option value="oneTime">One-time</option>
            </Select>
          </Field>
          <Field label="Date">
            <Input
              disabled={cadence !== "oneTime"}
              type="date"
              {...register("date")}
            />
          </Field>
          <div className="flex items-end">
            <Button className="w-full" type="submit">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </div>
        </form>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Cadence</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-t border-border" key={item.id}>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2">{item.category}</td>
                  <td className="px-3 py-2">{formatMoney(item.amountCents)}</td>
                  <td className="px-3 py-2 capitalize">
                    {item.cadence === "oneTime" ? "One-time" : item.cadence}
                  </td>
                  <td className="px-3 py-2">{item.date ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      aria-label={`Delete ${item.name}`}
                      onClick={() => onDelete(item.id)}
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
      </CardContent>
    </Card>
  );
}
