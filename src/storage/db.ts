import Dexie, { type Table } from "dexie";
import { planDocumentSchema } from "../domain/schemas";
import { createSeedPlan } from "../domain/sampleData";
import type { PlanDocument } from "../domain/types";

const ACTIVE_PLAN_KEY = "longTermFinancePlanner.activePlanId";

class PlannerDatabase extends Dexie {
  plans!: Table<PlanDocument, string>;

  constructor() {
    super("LongTermFinancePlanner");
    this.version(1).stores({
      plans: "id, updatedAt"
    });
  }
}

export const db = new PlannerDatabase();

export async function getActivePlan(): Promise<PlanDocument> {
  const activePlanId = localStorage.getItem(ACTIVE_PLAN_KEY);
  if (activePlanId) {
    const activePlan = await db.plans.get(activePlanId);
    if (activePlan) {
      return planDocumentSchema.parse(activePlan);
    }
  }

  const existingPlan = await db.plans.orderBy("updatedAt").last();
  if (existingPlan) {
    localStorage.setItem(ACTIVE_PLAN_KEY, existingPlan.id);
    return planDocumentSchema.parse(existingPlan);
  }

  const seedPlan = createSeedPlan();
  await savePlan(seedPlan);
  return seedPlan;
}

export async function savePlan(plan: PlanDocument): Promise<void> {
  const parsed = planDocumentSchema.parse({
    ...plan,
    updatedAt: new Date().toISOString()
  });
  await db.plans.put(parsed);
  localStorage.setItem(ACTIVE_PLAN_KEY, parsed.id);
}

export async function replaceActivePlan(plan: PlanDocument): Promise<PlanDocument> {
  const parsed = planDocumentSchema.parse({
    ...plan,
    updatedAt: new Date().toISOString()
  });
  await db.plans.put(parsed);
  localStorage.setItem(ACTIVE_PLAN_KEY, parsed.id);
  return parsed;
}

export async function resetPlan(): Promise<PlanDocument> {
  const seedPlan = createSeedPlan();
  await db.plans.clear();
  await savePlan(seedPlan);
  return seedPlan;
}
