import { Plus, Trash2, Unlink, Variable as VariableIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { VariableValueInput } from "../components/VariableField";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input } from "../components/ui/field";
import { createId } from "../domain/ids";
import { describeFieldPath } from "../domain/variables";
import type { Variable } from "../domain/types";
import { usePlannerStore } from "../store/plannerStore";

export function VariablesPage() {
  const {
    plan,
    updatePlan,
    setVariableValue,
    renameVariable,
    unbindField,
    deleteVariable
  } = usePlannerStore();

  if (!plan) {
    return null;
  }

  const variables = plan.variables;
  const totalBindings = variables.reduce(
    (count, variable) => count + variable.bindings.length,
    0
  );

  const addBlankVariable = () => {
    void updatePlan((draft) => {
      const variable: Variable = {
        id: createId("variable"),
        name: `Variable ${draft.variables.length + 1}`,
        kind: "money",
        value: 0,
        bindings: []
      };
      draft.variables = [...draft.variables, variable];
      return draft;
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Reusable values"
        title="Variables"
        actions={
          <>
            <Badge variant="muted">
              {variables.length} variable{variables.length === 1 ? "" : "s"} ·{" "}
              {totalBindings} linked field{totalBindings === 1 ? "" : "s"}
            </Badge>
            <Button onClick={addBlankVariable} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Variable
            </Button>
          </>
        }
      />

      {variables.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {variables.map((variable) => (
            <Card key={variable.id} className="min-w-0">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <VariableIcon
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                    <CardTitle>{variable.name || "Untitled variable"}</CardTitle>
                  </div>
                  <Badge variant={variable.kind === "money" ? "default" : "muted"}>
                    {variable.kind === "money" ? "Money" : "Percent"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name">
                    <Input
                      aria-label={`Name for ${variable.name}`}
                      value={variable.name}
                      onChange={(event) =>
                        void renameVariable(variable.id, event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Shared value">
                    <VariableValueInput
                      aria-label={`Value for ${variable.name}`}
                      kind={variable.kind}
                      onChange={(value) =>
                        void setVariableValue(variable.id, value)
                      }
                      value={variable.value}
                    />
                  </Field>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Linked fields ({variable.bindings.length})
                  </p>
                  {variable.bindings.length ? (
                    <ul className="space-y-2">
                      {variable.bindings.map((binding, index) => (
                        <li
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
                          key={`${variable.id}-${index}`}
                        >
                          <span className="min-w-0 truncate">
                            {describeFieldPath(plan, binding)}
                          </span>
                          <Button
                            aria-label="Unlink field"
                            onClick={() => void unbindField(binding)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                            Unlink
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                      Not linked to any field yet. Open the variable menu next to
                      a value to link it here.
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => void deleteVariable(variable.id)}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete variable
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <VariableIcon
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">No variables yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Click the variable button next to any money or percentage field
                to turn it into a reusable variable, then manage them here.
              </p>
            </div>
            <Button onClick={addBlankVariable} type="button" variant="outline">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create a blank variable
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
