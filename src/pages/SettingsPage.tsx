import { Download, Eraser, RotateCcw, Save, Undo2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { MoneyVariableField } from "../components/VariableField";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input } from "../components/ui/field";
import { formatMoney } from "../domain/money";
import { isSameDraft } from "../lib/draft";
import { downloadPlan, parsePlanJson } from "../storage/importExport";
import { usePlannerStore } from "../store/plannerStore";

type SettingsDraft = {
  name: string;
  startingSavingsCents: number;
  startingSpendableCents: number;
};

export function SettingsPage() {
  const { importPlan, plan, resetWithBlank, resetWithSeed, updatePlan } =
    usePlannerStore();
  const [draftSettings, setDraftSettings] = useState<SettingsDraft | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraftSettings(
      plan
        ? {
            name: plan.name,
            startingSavingsCents: plan.startingSavingsCents,
            startingSpendableCents: plan.startingSpendableCents
          }
        : null
    );
  }, [plan]);

  if (!plan || !draftSettings) {
    return null;
  }

  const savedSettings: SettingsDraft = {
    name: plan.name,
    startingSavingsCents: plan.startingSavingsCents,
    startingSpendableCents: plan.startingSpendableCents
  };
  const hasUnsavedChanges = !isSameDraft(savedSettings, draftSettings);

  const saveSettings = () => {
    void updatePlan((draft) => {
      draft.name = draftSettings.name;
      draft.startingSavingsCents = draftSettings.startingSavingsCents;
      draft.startingSpendableCents = draftSettings.startingSpendableCents;
      return draft;
    });
    setStatus("Plan settings saved");
  };

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
                value={draftSettings.name}
                onChange={(event) =>
                  setDraftSettings((current) => {
                    if (!current) {
                      return current;
                    }
                    return { ...current, name: event.target.value };
                  })
                }
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Starting spendable cash">
                <MoneyVariableField
                  path={{ scope: "plan", field: "startingSpendableCents" }}
                  suggestedName="Starting spendable cash"
                  valueCents={draftSettings.startingSpendableCents}
                  onChange={(value) =>
                    setDraftSettings((current) => {
                      if (!current) {
                        return current;
                      }
                      return { ...current, startingSpendableCents: value };
                    })
                  }
                />
              </Field>
              <Field label="Starting savings">
                <MoneyVariableField
                  path={{ scope: "plan", field: "startingSavingsCents" }}
                  suggestedName="Starting savings"
                  valueCents={draftSettings.startingSavingsCents}
                  onChange={(value) =>
                    setDraftSettings((current) => {
                      if (!current) {
                        return current;
                      }
                      return { ...current, startingSavingsCents: value };
                    })
                  }
                />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {hasUnsavedChanges ? <Badge variant="warning">Unsaved</Badge> : null}
              <Button
                disabled={!hasUnsavedChanges}
                onClick={() => setDraftSettings(savedSettings)}
                type="button"
                variant="outline"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Discard
              </Button>
              <Button
                disabled={!hasUnsavedChanges}
                onClick={saveSettings}
                type="button"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save
              </Button>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="w-full"
                onClick={() => {
                  void resetWithSeed();
                  setStatus("Demo data reset");
                }}
                type="button"
                variant="outline"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset Demo Data
              </Button>
              <Button
                className="w-full"
                onClick={() => {
                  if (
                    window.confirm(
                      "This will delete all local planner data and create an empty plan."
                    )
                  ) {
                    void resetWithBlank();
                    setStatus("Blank slate created");
                  }
                }}
                type="button"
                variant="outline"
              >
                <Eraser className="h-4 w-4" aria-hidden="true" />
                Blank Slate
              </Button>
            </div>
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
