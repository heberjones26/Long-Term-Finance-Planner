import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO
} from "date-fns";
import {
  CalendarPlus,
  ClipboardCheck,
  Copy,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  X
} from "lucide-react";
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
import { dollarsToCents, formatMoney, formatPercent } from "../domain/money";
import {
  getTodayLocalDate,
  isPeriodCurrent,
  isPeriodPast
} from "../domain/periods";
import { projectPlan } from "../domain/projection";
import { calculatePeriodTaxProfile, taxFilingStatusLabels } from "../domain/tax";
import type {
  Cadence,
  FinancialPeriod,
  PeriodAudit,
  PeriodSummary,
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
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const projection = useMemo(() => {
    if (!plan) {
      return null;
    }
    if (!draftPeriod) {
      return projectPlan(plan);
    }

    return projectPlan({
      ...plan,
      periods: plan.periods.map((period) =>
        period.id === draftPeriod.id ? draftPeriod : period
      )
    });
  }, [draftPeriod, plan]);
  const today = useMemo(() => getTodayLocalDate(), []);

  const sortedPeriods = useMemo(
    () =>
      plan
        ? [...plan.periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
        : [],
    [plan]
  );
  const currentPeriodId = useMemo(
    () =>
      sortedPeriods.find((period) => isPeriodCurrent(period, today))?.id ?? "",
    [sortedPeriods, today]
  );

  useEffect(() => {
    if (!plan) {
      return;
    }
    if (
      !selectedPeriodId ||
      !plan.periods.some((period) => period.id === selectedPeriodId)
    ) {
      setSelectedPeriodId(currentPeriodId || sortedPeriods[0]?.id || "");
    }
  }, [currentPeriodId, plan, selectedPeriodId, sortedPeriods]);

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

  const openAuditForPeriod = (period: FinancialPeriod) => {
    setSelectedPeriodId(period.id);
    if (draftPeriod?.id !== period.id) {
      setDraftPeriod(structuredClone(period));
    }
    setAuditModalOpen(true);
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
      audit: undefined,
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
    setAuditModalOpen(false);
    const fallback =
      sortedPeriods.find(
        (period) =>
          period.id !== selectedPeriod.id && isPeriodCurrent(period, today)
      ) ??
      sortedPeriods.find((period) => period.id !== selectedPeriod.id);
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
            const current = isPeriodCurrent(period, today);
            const past = isPeriodPast(period, today);
            return (
              <div
                className={cn(
                  "w-full rounded-md border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary",
                  current && "border-emerald-300 bg-emerald-50/70",
                  selected && "border-primary bg-primary/5"
                )}
                key={period.id}
              >
                <button
                  className="w-full text-left"
                  onClick={() => setSelectedPeriodId(period.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{period.name}</p>
                    {current ? <Badge variant="success">Current</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {period.startDate} to {period.endDate}
                  </p>
                </button>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="muted">
                      {scenario?.name ?? "Missing COL"}
                    </Badge>
                    {period.audit?.completedAt ? (
                      <Badge variant="success">Audited</Badge>
                    ) : past ? (
                      <Badge variant="warning">Audit ready</Badge>
                    ) : null}
                  </div>
                  <Button
                    onClick={() => openAuditForPeriod(period)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Audit
                  </Button>
                </div>
              </div>
            );
          })}
        </aside>

        {selectedPeriod && draftPeriod ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{draftPeriod.name}</CardTitle>
                  <PeriodStatusBadges period={draftPeriod} today={today} />
                </div>
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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryPill
                      label="Carryover in"
                      value={formatMoney(selectedSummary.carryoverInCents)}
                    />
                    <SummaryPill
                      label="Profit"
                      value={formatMoney(selectedSummary.profitCents)}
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
                    onClick={() => setAuditModalOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                    Audit
                  </Button>
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
              onUpdate={(itemId, updater) =>
                updateDraftPeriod((period) => {
                  const item = period.grossIncomeItems.find(
                    (candidate) => candidate.id === itemId
                  );
                  if (item) {
                    updater(item);
                  }
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
              onUpdate={(itemId, updater) =>
                updateDraftPeriod((period) => {
                  const item = period.extraExpenseItems.find(
                    (candidate) => candidate.id === itemId
                  );
                  if (item) {
                    updater(item);
                  }
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

      {auditModalOpen && draftPeriod ? (
        <PeriodAuditModal
          hasUnsavedChanges={hasUnsavedChanges}
          period={draftPeriod}
          summary={selectedSummary}
          today={today}
          onChange={(audit) =>
            updateDraftPeriod((period) => {
              period.audit = audit;
            })
          }
          onClose={() => setAuditModalOpen(false)}
          onSave={() => {
            savePeriod();
            setAuditModalOpen(false);
          }}
        />
      ) : null}
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

function PeriodStatusBadges({
  period,
  today
}: {
  period: FinancialPeriod;
  today: string;
}) {
  const current = isPeriodCurrent(period, today);
  const past = isPeriodPast(period, today);

  return (
    <div className="flex flex-wrap gap-2">
      {current ? <Badge variant="success">Current</Badge> : null}
      {period.audit?.completedAt ? (
        <Badge variant="success">Audited</Badge>
      ) : past ? (
        <Badge variant="warning">Audit ready</Badge>
      ) : current ? (
        <Badge variant="muted">In progress</Badge>
      ) : (
        <Badge variant="muted">Upcoming</Badge>
      )}
    </div>
  );
}

function PeriodAuditModal({
  hasUnsavedChanges,
  onChange,
  onClose,
  onSave,
  period,
  summary,
  today
}: {
  hasUnsavedChanges: boolean;
  onChange: (audit: PeriodAudit | undefined) => void;
  onClose: () => void;
  onSave: () => void;
  period: FinancialPeriod;
  summary: PeriodSummary | undefined;
  today: string;
}) {
  const audit = period.audit ?? createDefaultPeriodAudit(summary);
  const hasAudit = Boolean(period.audit);
  const actualProfitCents = calculateAuditProfitCents(audit);
  const plannedOutflowCents =
    (summary?.taxCents ?? 0) +
    (summary?.costOfLivingCents ?? 0) +
    (summary?.extraExpenseCents ?? 0) +
    (summary?.charityCents ?? 0);
  const actualOutflowCents =
    audit.actualTaxCents +
    audit.actualCostOfLivingCents +
    audit.actualExtraExpenseCents +
    audit.actualCharityCents;
  const auditRows = [
    {
      label: "Gross income",
      plannedCents: summary?.grossIncomeCents ?? 0,
      actualCents: audit.actualGrossIncomeCents
    },
    {
      label: "Taxes",
      plannedCents: summary?.taxCents ?? 0,
      actualCents: audit.actualTaxCents
    },
    {
      label: "Cost of living",
      plannedCents: summary?.costOfLivingCents ?? 0,
      actualCents: audit.actualCostOfLivingCents
    },
    {
      label: "Extra expenses",
      plannedCents: summary?.extraExpenseCents ?? 0,
      actualCents: audit.actualExtraExpenseCents
    },
    {
      label: "Charity",
      plannedCents: summary?.charityCents ?? 0,
      actualCents: audit.actualCharityCents
    },
    {
      label: "Savings",
      plannedCents: summary?.plannedSavingsCents ?? 0,
      actualCents: audit.actualSavingsCents
    },
    {
      label: "Profit",
      plannedCents: summary?.profitCents ?? 0,
      actualCents: actualProfitCents
    }
  ];

  const patchAudit = (updates: Partial<PeriodAudit>) => {
    onChange({
      ...audit,
      ...updates
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
    >
      <div
        className={cn(
          "flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-soft",
          isPeriodPast(period, today) &&
            !period.audit?.completedAt &&
            "border-amber-200"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <CardTitle>Post-period Audit</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {period.name} · {period.startDate} to {period.endDate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PeriodStatusBadges period={period} today={today} />
            <Button
              aria-label="Close audit"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryPill
            label="Actual profit"
            value={formatMoney(actualProfitCents)}
          />
          <SummaryPill
            label="Profit delta"
            value={formatSignedMoney(
              actualProfitCents - (summary?.profitCents ?? 0)
            )}
          />
          <SummaryPill
            label="Expense variance"
            value={formatSignedMoney(actualOutflowCents - plannedOutflowCents)}
          />
          <SummaryPill
            label="Savings follow-through"
            value={formatRatioPercent(
              audit.actualSavingsCents,
              summary?.plannedSavingsCents ?? 0
            )}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AuditMoneyField
            label="Actual gross income"
            valueCents={audit.actualGrossIncomeCents}
            onChange={(value) =>
              patchAudit({ actualGrossIncomeCents: Math.max(value, 0) })
            }
          />
          <AuditMoneyField
            label="Actual taxes"
            valueCents={audit.actualTaxCents}
            onChange={(value) =>
              patchAudit({ actualTaxCents: Math.max(value, 0) })
            }
          />
          <AuditMoneyField
            label="Actual cost of living"
            valueCents={audit.actualCostOfLivingCents}
            onChange={(value) =>
              patchAudit({ actualCostOfLivingCents: Math.max(value, 0) })
            }
          />
          <AuditMoneyField
            label="Actual extra expenses"
            valueCents={audit.actualExtraExpenseCents}
            onChange={(value) =>
              patchAudit({ actualExtraExpenseCents: Math.max(value, 0) })
            }
          />
          <AuditMoneyField
            label="Actual charity"
            valueCents={audit.actualCharityCents}
            onChange={(value) =>
              patchAudit({ actualCharityCents: Math.max(value, 0) })
            }
          />
          <AuditMoneyField
            label="Actual savings"
            valueCents={audit.actualSavingsCents}
            onChange={(value) =>
              patchAudit({ actualSavingsCents: Math.max(value, 0) })
            }
          />
        </div>

        <Field label="Audit notes">
          <Textarea
            value={audit.notes ?? ""}
            onChange={(event) => patchAudit({ notes: event.target.value })}
          />
        </Field>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Metric</th>
                <th className="px-3 py-2 font-medium">Planned</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">Delta</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr className="border-t border-border" key={row.label}>
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2">
                    {formatMoney(row.plannedCents)}
                  </td>
                  <td className="px-3 py-2">{formatMoney(row.actualCents)}</td>
                  <td className="px-3 py-2">
                    {formatSignedMoney(row.actualCents - row.plannedCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {audit.completedAt
              ? `Audited ${audit.completedAt.slice(0, 10)}`
              : hasAudit
                ? "Audit draft"
                : "No saved audit"}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => onChange(createDefaultPeriodAudit(summary))}
              type="button"
              variant="outline"
            >
              Prefill from plan
            </Button>
            <Button
              onClick={() =>
                onChange({
                  ...audit,
                  completedAt: new Date().toISOString()
                })
              }
              type="button"
            >
              Mark audited
            </Button>
            <Button
              disabled={!audit.completedAt}
              onClick={() => onChange(removeAuditCompletion(audit))}
              type="button"
              variant="outline"
            >
              Undo audited
            </Button>
            <Button
              disabled={!hasAudit}
              onClick={() => onChange(undefined)}
              type="button"
              variant="destructive"
            >
              Delete audit
            </Button>
          </div>
        </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-5">
          {hasUnsavedChanges ? <Badge variant="warning">Unsaved</Badge> : null}
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
          <Button
            disabled={!hasUnsavedChanges}
            onClick={onSave}
            type="button"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Save audit
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuditMoneyField({
  label,
  onChange,
  valueCents
}: {
  label: string;
  onChange: (valueCents: number) => void;
  valueCents: number;
}) {
  return (
    <Field label={label}>
      <MoneyInput valueCents={valueCents} onChange={onChange} />
    </Field>
  );
}

function createDefaultPeriodAudit(
  summary: PeriodSummary | undefined
): PeriodAudit {
  return {
    actualGrossIncomeCents: summary?.grossIncomeCents ?? 0,
    actualTaxCents: summary?.taxCents ?? 0,
    actualCostOfLivingCents: summary?.costOfLivingCents ?? 0,
    actualExtraExpenseCents: summary?.extraExpenseCents ?? 0,
    actualCharityCents: summary?.charityCents ?? 0,
    actualSavingsCents: summary?.plannedSavingsCents ?? 0,
    notes: ""
  };
}

function removeAuditCompletion(audit: PeriodAudit): PeriodAudit {
  const nextAudit = structuredClone(audit);
  delete nextAudit.completedAt;
  return nextAudit;
}

function calculateAuditProfitCents(audit: PeriodAudit): number {
  return (
    audit.actualGrossIncomeCents -
    audit.actualTaxCents -
    audit.actualCostOfLivingCents -
    audit.actualExtraExpenseCents -
    audit.actualCharityCents
  );
}

function formatSignedMoney(cents: number): string {
  const normalizedCents = Object.is(cents, -0) ? 0 : cents;
  return normalizedCents > 0
    ? `+${formatMoney(normalizedCents)}`
    : formatMoney(normalizedCents);
}

function formatRatioPercent(actualCents: number, plannedCents: number): string {
  if (plannedCents === 0) {
    return actualCents === 0 ? "100%" : "n/a";
  }

  return formatPercent((actualCents / plannedCents) * 100);
}

function PeriodItemSection({
  items,
  onAdd,
  onDelete,
  onUpdate,
  title
}: {
  items: RecurringMoneyItem[];
  onAdd: (item: RecurringMoneyItem) => void;
  onDelete: (itemId: string) => void;
  onUpdate: (
    itemId: string,
    updater: (item: RecurringMoneyItem) => void
  ) => void;
  title: string;
}) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
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

  useEffect(() => {
    if (editingItemId && !items.some((item) => item.id === editingItemId)) {
      setEditingItemId(null);
    }
  }, [editingItemId, items]);

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
      date: values.cadence === "oneTime" ? values.date : undefined,
      enabled: true
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
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>
          <div className="grid gap-3 grid-cols-[minmax(160px,240px)_auto]">
            <Field label="Date">
              <Input
                disabled={cadence !== "oneTime"}
                type="date"
                {...register("date")}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add
              </Button>
            </div>
          </div>
        </form>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="w-24 px-3 py-2 font-medium">Included</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Cadence</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const enabled = item.enabled !== false;
                const isEditing = editingItemId === item.id;

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
                          onUpdate(item.id, (draftItem) => {
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
                            onUpdate(item.id, (draftItem) => {
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
                            onUpdate(item.id, (draftItem) => {
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
                        <MoneyInput
                          aria-label={`Amount for ${item.name}`}
                          className="min-w-28"
                          valueCents={item.amountCents}
                          onChange={(value) =>
                            onUpdate(item.id, (draftItem) => {
                              draftItem.amountCents = Math.max(value, 0);
                            })
                          }
                        />
                      ) : (
                        formatMoney(item.amountCents)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Select
                          aria-label={`Cadence for ${item.name}`}
                          className="min-w-32"
                          value={item.cadence}
                          onChange={(event) =>
                            onUpdate(item.id, (draftItem) => {
                              const nextCadence = event.target.value as Cadence;
                              draftItem.cadence = nextCadence;
                              draftItem.date =
                                nextCadence === "oneTime"
                                  ? draftItem.date ??
                                    format(new Date(), "yyyy-MM-dd")
                                  : undefined;
                            })
                          }
                        >
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                          <option value="yearly">Yearly</option>
                          <option value="oneTime">One-time</option>
                        </Select>
                      ) : (
                        <span className="capitalize">
                          {item.cadence === "oneTime"
                            ? "One-time"
                            : item.cadence}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          aria-label={`Date for ${item.name}`}
                          className="min-w-36"
                          disabled={item.cadence !== "oneTime"}
                          type="date"
                          value={item.date ?? ""}
                          onChange={(event) =>
                            onUpdate(item.id, (draftItem) => {
                              draftItem.date = event.target.value;
                            })
                          }
                        />
                      ) : (
                        item.date ?? "-"
                      )}
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
                            onDelete(item.id);
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
      </CardContent>
    </Card>
  );
}
