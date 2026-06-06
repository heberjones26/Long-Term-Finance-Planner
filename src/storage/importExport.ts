import { planDocumentSchema } from "../domain/schemas";
import type { PlanDocument } from "../domain/types";

export function serializePlan(plan: PlanDocument): string {
  return JSON.stringify(planDocumentSchema.parse(plan), null, 2);
}

export function parsePlanJson(json: string): PlanDocument {
  const parsed: unknown = JSON.parse(json);
  return planDocumentSchema.parse(parsed);
}

export function downloadPlan(plan: PlanDocument) {
  const blob = new Blob([serializePlan(plan)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
