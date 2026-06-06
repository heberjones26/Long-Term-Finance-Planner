import { Download, RotateCcw, Upload } from "lucide-react";
import { useState } from "react";
import { MoneyInput } from "../components/MoneyInput";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input } from "../components/ui/field";
import { formatMoney } from "../domain/money";
import { downloadPlan, parsePlanJson } from "../storage/importExport";
import { usePlannerStore } from "../store/plannerStore";

export function SettingsPage() {
  const { importPlan, plan, resetWithSeed, updatePlan } = usePlannerStore();
  const [status, setStatus] = useState("");

  if (!plan) {
    return null;
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const importedPlan = parsePlanJson(text);
      await importPlan(importedPlan);
      setStatus("Imported");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Local Data" title="Settings" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Plan name">
              <Input
                value={plan.name}
                onChange={(event) =>
                  void updatePlan((draft) => {
                    draft.name = event.target.value;
                    return draft;
                  })
                }
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Starting spendable cash">
                <MoneyInput
                  valueCents={plan.startingSpendableCents}
                  onChange={(value) =>
                    void updatePlan((draft) => {
                      draft.startingSpendableCents = value;
                      return draft;
                    })
                  }
                />
              </Field>
              <Field label="Starting savings">
                <MoneyInput
                  valueCents={plan.startingSavingsCents}
                  onChange={(value) =>
                    void updatePlan((draft) => {
                      draft.startingSavingsCents = value;
                      return draft;
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 rounded-md border border-border bg-background p-4 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Currency</p>
                <p className="font-semibold">{plan.currency}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Starting total</p>
                <p className="font-semibold">
                  {formatMoney(
                    plan.startingSpendableCents + plan.startingSavingsCents
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Updated</p>
                <p className="font-semibold">
                  {new Date(plan.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              onClick={() => downloadPlan(plan)}
              type="button"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export JSON
            </Button>
            <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import JSON
              <input
                accept="application/json"
                className="sr-only"
                type="file"
                onChange={(event) => void handleImport(event.target.files?.[0])}
              />
            </label>
            <Button
              className="w-full"
              onClick={() => {
                void resetWithSeed();
                setStatus("Reset");
              }}
              type="button"
              variant="outline"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Demo Data
            </Button>
            {status ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {status}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
