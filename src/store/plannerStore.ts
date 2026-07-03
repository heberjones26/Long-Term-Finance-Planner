import { create } from "zustand";
import type {
  PlanDocument,
  Variable,
  VariableFieldPath,
  VariableKind
} from "../domain/types";
import { createId } from "../domain/ids";
import {
  applyVariablesToPlan,
  bindFieldTo,
  getFieldValue,
  pathKind,
  unbindFieldFrom
} from "../domain/variables";
import {
  getActivePlan,
  replaceActivePlan,
  resetPlan,
  resetToBlankPlan,
  savePlan
} from "../storage/db";

let pendingSaveTimeout: ReturnType<typeof setTimeout> | undefined;

type PlannerState = {
  plan: PlanDocument | null;
  isLoading: boolean;
  error: string | null;
  loadPlan: () => Promise<void>;
  updatePlan: (updater: (plan: PlanDocument) => PlanDocument) => Promise<void>;
  importPlan: (plan: PlanDocument) => Promise<void>;
  resetWithSeed: () => Promise<void>;
  resetWithBlank: () => Promise<void>;
  createVariableFromField: (
    name: string,
    path: VariableFieldPath
  ) => Promise<void>;
  bindFieldToVariable: (
    variableId: string,
    path: VariableFieldPath
  ) => Promise<void>;
  unbindField: (path: VariableFieldPath) => Promise<void>;
  setVariableValue: (variableId: string, value: number) => Promise<void>;
  renameVariable: (variableId: string, name: string) => Promise<void>;
  deleteVariable: (variableId: string) => Promise<void>;
};

function clampVariableValue(value: number, kind: VariableKind): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (kind === "money") {
    return Math.max(Math.round(value), 0);
  }
  return Math.min(Math.max(value, 0), 100);
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  plan: null,
  isLoading: true,
  error: null,
  loadPlan: async () => {
    set({ isLoading: true, error: null });
    try {
      const plan = await getActivePlan();
      set({ plan: applyVariablesToPlan(plan), isLoading: false });
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
    // Reconcile bound fields to their variable values so the saved plan (and
    // every page reading it) stays live-linked no matter which field changed.
    const reconciledPlan = applyVariablesToPlan(nextPlan);
    const planWithTimestamp = {
      ...reconciledPlan,
      updatedAt: new Date().toISOString()
    };
    set({ plan: planWithTimestamp, error: null });

    if (pendingSaveTimeout) {
      clearTimeout(pendingSaveTimeout);
    }

    pendingSaveTimeout = setTimeout(() => {
      void savePlan(planWithTimestamp).catch((error) => {
        set({
          error: error instanceof Error ? error.message : "Unable to save plan."
        });
      });
    }, 350);
  },
  importPlan: async (plan) => {
    if (pendingSaveTimeout) {
      clearTimeout(pendingSaveTimeout);
      pendingSaveTimeout = undefined;
    }
    set({ error: null });
    try {
      const imported = await replaceActivePlan(plan);
      set({ plan: applyVariablesToPlan(imported) });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to import plan."
      });
    }
  },
  resetWithSeed: async () => {
    if (pendingSaveTimeout) {
      clearTimeout(pendingSaveTimeout);
      pendingSaveTimeout = undefined;
    }
    set({ error: null });
    try {
      const plan = await resetPlan();
      set({ plan });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to reset plan."
      });
    }
  },
  resetWithBlank: async () => {
    if (pendingSaveTimeout) {
      clearTimeout(pendingSaveTimeout);
      pendingSaveTimeout = undefined;
    }
    set({ error: null });
    try {
      const plan = await resetToBlankPlan();
      set({ plan });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to create a blank plan."
      });
    }
  },
  createVariableFromField: async (name, path) => {
    await get().updatePlan((draft) => {
      const kind = pathKind(path);
      const value = clampVariableValue(getFieldValue(draft, path) ?? 0, kind);
      const variable: Variable = {
        id: createId("variable"),
        name: name.trim() || "New variable",
        kind,
        value,
        bindings: []
      };
      draft.variables = [
        ...unbindFieldFrom(draft.variables ?? [], path),
        { ...variable, bindings: [path] }
      ];
      return draft;
    });
  },
  bindFieldToVariable: async (variableId, path) => {
    await get().updatePlan((draft) => {
      draft.variables = bindFieldTo(draft.variables ?? [], variableId, path);
      return draft;
    });
  },
  unbindField: async (path) => {
    await get().updatePlan((draft) => {
      draft.variables = unbindFieldFrom(draft.variables ?? [], path);
      return draft;
    });
  },
  setVariableValue: async (variableId, value) => {
    await get().updatePlan((draft) => {
      draft.variables = (draft.variables ?? []).map((variable) =>
        variable.id === variableId
          ? {
              ...variable,
              value: clampVariableValue(value, variable.kind)
            }
          : variable
      );
      return draft;
    });
  },
  renameVariable: async (variableId, name) => {
    await get().updatePlan((draft) => {
      draft.variables = (draft.variables ?? []).map((variable) =>
        variable.id === variableId
          ? { ...variable, name: name.trim() || variable.name }
          : variable
      );
      return draft;
    });
  },
  deleteVariable: async (variableId) => {
    await get().updatePlan((draft) => {
      draft.variables = (draft.variables ?? []).filter(
        (variable) => variable.id !== variableId
      );
      return draft;
    });
  }
}));
