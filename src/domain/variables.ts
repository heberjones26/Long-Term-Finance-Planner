import type {
  PlanDocument,
  Variable,
  VariableFieldPath,
  VariableKind
} from "./types";

/**
 * Variables are a lightweight "named cell" layer over the plan. A variable owns
 * a value and a list of field bindings; the value is the single source of truth
 * for every field it is bound to. `applyVariablesToPlan` reconciles the plan so
 * bound fields always equal their variable's value, which keeps projections and
 * every page in sync without touching the projection engine.
 */

export function pathKind(path: VariableFieldPath): VariableKind {
  switch (path.scope) {
    case "plan":
    case "costItem":
    case "periodItem":
    case "goal":
    case "goalScenario":
      return "money";
    case "period":
      return "percent";
    case "houseField":
      switch (path.field) {
        case "purchasePriceCents":
        case "monthlyInsuranceCents":
        case "monthlyHoaCents":
          return "money";
        default:
          return "percent";
      }
  }
}

export function isSameFieldPath(
  a: VariableFieldPath,
  b: VariableFieldPath
): boolean {
  if (a.scope !== b.scope) {
    return false;
  }
  switch (a.scope) {
    case "plan":
      return b.scope === "plan" && a.field === b.field;
    case "costItem":
      return (
        b.scope === "costItem" &&
        a.scenarioId === b.scenarioId &&
        a.itemId === b.itemId
      );
    case "periodItem":
      return (
        b.scope === "periodItem" &&
        a.periodId === b.periodId &&
        a.itemKind === b.itemKind &&
        a.itemId === b.itemId
      );
    case "period":
      return (
        b.scope === "period" &&
        a.periodId === b.periodId &&
        a.field === b.field
      );
    case "goal":
      return b.scope === "goal" && a.goalId === b.goalId && a.field === b.field;
    case "goalScenario":
      return (
        b.scope === "goalScenario" &&
        a.goalId === b.goalId &&
        a.scenarioId === b.scenarioId &&
        a.field === b.field
      );
    case "houseField":
      return (
        b.scope === "houseField" &&
        a.goalId === b.goalId &&
        a.scenarioId === b.scenarioId &&
        a.field === b.field
      );
  }
}

export function findVariableForPath(
  variables: Variable[],
  path: VariableFieldPath
): Variable | undefined {
  return variables.find((variable) =>
    variable.bindings.some((binding) => isSameFieldPath(binding, path))
  );
}

/** Reads the current value stored at a field path, or undefined if it is gone. */
export function getFieldValue(
  plan: PlanDocument,
  path: VariableFieldPath
): number | undefined {
  switch (path.scope) {
    case "plan":
      return plan[path.field];
    case "costItem": {
      const scenario = plan.costOfLivingScenarios.find(
        (item) => item.id === path.scenarioId
      );
      return scenario?.items.find((item) => item.id === path.itemId)
        ?.amountCents;
    }
    case "periodItem": {
      const period = plan.periods.find((item) => item.id === path.periodId);
      const items =
        path.itemKind === "grossIncome"
          ? period?.grossIncomeItems
          : period?.extraExpenseItems;
      return items?.find((item) => item.id === path.itemId)?.amountCents;
    }
    case "period": {
      const period = plan.periods.find((item) => item.id === path.periodId);
      if (!period) {
        return undefined;
      }
      return period[path.field] ?? 0;
    }
    case "goal": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      if (!goal) {
        return undefined;
      }
      return goal.contributedFromSavingsCents ?? 0;
    }
    case "goalScenario": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      const scenario = goal?.scenarios.find(
        (item) => item.id === path.scenarioId
      );
      return scenario?.targetAmountCents;
    }
    case "houseField": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      const scenario = goal?.scenarios.find(
        (item) => item.id === path.scenarioId
      );
      return scenario?.house?.[path.field];
    }
  }
}

function clampForKind(value: number, kind: VariableKind): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (kind === "money") {
    return Math.max(Math.round(value), 0);
  }
  return Math.min(Math.max(value, 0), 100);
}

/** Writes a value into the plan at a field path. Mutates `plan` in place. */
export function setFieldValue(
  plan: PlanDocument,
  path: VariableFieldPath,
  rawValue: number
): boolean {
  const value = clampForKind(rawValue, pathKind(path));
  switch (path.scope) {
    case "plan":
      plan[path.field] = value;
      return true;
    case "costItem": {
      const scenario = plan.costOfLivingScenarios.find(
        (item) => item.id === path.scenarioId
      );
      const item = scenario?.items.find((entry) => entry.id === path.itemId);
      if (!item) {
        return false;
      }
      item.amountCents = value;
      return true;
    }
    case "periodItem": {
      const period = plan.periods.find((item) => item.id === path.periodId);
      const items =
        path.itemKind === "grossIncome"
          ? period?.grossIncomeItems
          : period?.extraExpenseItems;
      const item = items?.find((entry) => entry.id === path.itemId);
      if (!item) {
        return false;
      }
      item.amountCents = value;
      return true;
    }
    case "period": {
      const period = plan.periods.find((item) => item.id === path.periodId);
      if (!period) {
        return false;
      }
      period[path.field] = value;
      return true;
    }
    case "goal": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      if (!goal) {
        return false;
      }
      goal.contributedFromSavingsCents = value;
      return true;
    }
    case "goalScenario": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      const scenario = goal?.scenarios.find(
        (item) => item.id === path.scenarioId
      );
      if (!scenario) {
        return false;
      }
      scenario.targetAmountCents = value;
      return true;
    }
    case "houseField": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      const scenario = goal?.scenarios.find(
        (item) => item.id === path.scenarioId
      );
      if (!scenario?.house) {
        return false;
      }
      scenario.house[path.field] = value;
      return true;
    }
  }
}

/** True when the field a binding points at still exists in the plan. */
export function isBindingLive(
  plan: PlanDocument,
  path: VariableFieldPath
): boolean {
  return getFieldValue(plan, path) !== undefined;
}

/**
 * Returns a new plan where every bound field equals its variable's value and
 * bindings pointing at deleted fields are pruned. Idempotent.
 */
export function applyVariablesToPlan(plan: PlanDocument): PlanDocument {
  const next = structuredClone(plan);
  const variables = next.variables ?? [];

  for (const variable of variables) {
    const liveBindings: VariableFieldPath[] = [];
    for (const binding of variable.bindings) {
      const applied = setFieldValue(next, binding, variable.value);
      if (applied) {
        liveBindings.push(binding);
      }
    }
    variable.bindings = liveBindings;
  }

  next.variables = variables;
  return next;
}

const MONEY_LABELS: Record<string, string> = {
  startingSpendableCents: "Starting spendable cash",
  startingSavingsCents: "Starting savings",
  contributedFromSavingsCents: "Contributed from savings",
  targetAmountCents: "Goal amount",
  purchasePriceCents: "Purchase price",
  monthlyInsuranceCents: "Insurance",
  monthlyHoaCents: "HOA"
};

const PERCENT_LABELS: Record<string, string> = {
  additionalTaxRate: "State/local tax estimate",
  savingsRate: "Savings rate",
  charityRate: "Charity rate",
  downPaymentPercent: "Down payment",
  closingCostPercent: "Closing costs",
  interestRatePercent: "Interest rate",
  annualPropertyTaxPercent: "Property tax"
};

/** Human-readable "where does this live" label for a binding. */
export function describeFieldPath(
  plan: PlanDocument,
  path: VariableFieldPath
): string {
  switch (path.scope) {
    case "plan":
      return `Settings · ${MONEY_LABELS[path.field] ?? path.field}`;
    case "costItem": {
      const scenario = plan.costOfLivingScenarios.find(
        (item) => item.id === path.scenarioId
      );
      const item = scenario?.items.find((entry) => entry.id === path.itemId);
      return `Cost of living · ${scenario?.name ?? "?"} · ${
        item?.name ?? "?"
      }`;
    }
    case "periodItem": {
      const period = plan.periods.find((item) => item.id === path.periodId);
      const items =
        path.itemKind === "grossIncome"
          ? period?.grossIncomeItems
          : period?.extraExpenseItems;
      const item = items?.find((entry) => entry.id === path.itemId);
      const kindLabel =
        path.itemKind === "grossIncome" ? "income" : "extra expense";
      return `Periods · ${period?.name ?? "?"} · ${
        item?.name ?? "?"
      } (${kindLabel})`;
    }
    case "period": {
      const period = plan.periods.find((item) => item.id === path.periodId);
      return `Periods · ${period?.name ?? "?"} · ${
        PERCENT_LABELS[path.field] ?? path.field
      }`;
    }
    case "goal": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      return `Goals · ${goal?.name ?? "?"} · ${
        MONEY_LABELS[path.field] ?? path.field
      }`;
    }
    case "goalScenario": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      const scenario = goal?.scenarios.find(
        (item) => item.id === path.scenarioId
      );
      return `Goals · ${goal?.name ?? "?"} · ${scenario?.name ?? "?"} · ${
        MONEY_LABELS[path.field] ?? path.field
      }`;
    }
    case "houseField": {
      const goal = plan.goals.find((item) => item.id === path.goalId);
      const scenario = goal?.scenarios.find(
        (item) => item.id === path.scenarioId
      );
      const label = MONEY_LABELS[path.field] ?? PERCENT_LABELS[path.field];
      return `Goals · ${goal?.name ?? "?"} · ${scenario?.name ?? "?"} · ${
        label ?? path.field
      }`;
    }
  }
}

/** Removes a field binding from whichever variable currently owns it. */
export function unbindFieldFrom(
  variables: Variable[],
  path: VariableFieldPath
): Variable[] {
  return variables.map((variable) => ({
    ...variable,
    bindings: variable.bindings.filter(
      (binding) => !isSameFieldPath(binding, path)
    )
  }));
}

/** Binds a field to a variable, first detaching it from any other variable. */
export function bindFieldTo(
  variables: Variable[],
  variableId: string,
  path: VariableFieldPath
): Variable[] {
  const detached = unbindFieldFrom(variables, path);
  return detached.map((variable) =>
    variable.id === variableId
      ? { ...variable, bindings: [...variable.bindings, path] }
      : variable
  );
}
