import { create } from "zustand";
import { getActivePlan, replaceActivePlan, resetPlan, savePlan } from "../storage/db";
import type { PlanDocument } from "../domain/types";

type PlannerState = {
  plan: PlanDocument | null;
  isLoading: boolean;
  error: string | null;
  loadPlan: () => Promise<void>;
  updatePlan: (updater: (plan: PlanDocument) => PlanDocument) => Promise<void>;
  importPlan: (plan: PlanDocument) => Promise<void>;
  resetWithSeed: () => Promise<void>;
};

export const usePlannerStore = create<PlannerState>((set, get) => ({
  plan: null,
  isLoading: true,
  error: null,
  loadPlan: async () => {
    set({ isLoading: true, error: null });
    try {
      const plan = await getActivePlan();
      set({ plan, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to load plan.",
        isLoading: false
      });
    }
  },
  updatePlan: async (updater) => {
    const currentPlan = get().plan;
    if (!currentPlan) {
      return;
    }
    const nextPlan = updater(structuredClone(currentPlan));
    const planWithTimestamp = {
      ...nextPlan,
      updatedAt: new Date().toISOString()
    };
    set({ plan: planWithTimestamp, error: null });
    try {
      await savePlan(planWithTimestamp);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to save plan."
      });
    }
  },
  importPlan: async (plan) => {
    set({ error: null });
    try {
      const imported = await replaceActivePlan(plan);
      set({ plan: imported });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to import plan."
      });
    }
  },
  resetWithSeed: async () => {
    set({ error: null });
    try {
      const plan = await resetPlan();
      set({ plan });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to reset plan."
      });
    }
  }
}));
