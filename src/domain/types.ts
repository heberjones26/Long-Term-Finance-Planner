export type Id = string;
export type LocalDate = string;
export type MonthKey = string;
export type MoneyCents = number;

export type Cadence = "monthly" | "yearly" | "weekly" | "oneTime";
export type TaxFilingStatus =
  | "single"
  | "marriedJoint"
  | "headOfHousehold"
  | "marriedSeparate";
export type GoalType = "house" | "other";

export type CostItem = {
  id: Id;
  name: string;
  category: string;
  amountCents: MoneyCents;
  cadence: Extract<Cadence, "monthly" | "yearly">;
  enabled?: boolean;
};

export type CostOfLivingScenario = {
  id: Id;
  name: string;
  notes?: string;
  items: CostItem[];
};

export type RecurringMoneyItem = {
  id: Id;
  name: string;
  category: string;
  amountCents: MoneyCents;
  cadence: Cadence;
  date?: LocalDate;
  enabled?: boolean;
};

export type PeriodAudit = {
  actualGrossIncomeCents: MoneyCents;
  actualTaxCents: MoneyCents;
  actualCostOfLivingCents: MoneyCents;
  actualExtraExpenseCents: MoneyCents;
  actualCharityCents: MoneyCents;
  actualSavingsCents: MoneyCents;
  notes?: string;
  completedAt?: string;
};

export type FinancialPeriod = {
  id: Id;
  name: string;
  startDate: LocalDate;
  endDate: LocalDate;
  costOfLivingScenarioId: Id;
  grossIncomeItems: RecurringMoneyItem[];
  extraExpenseItems: RecurringMoneyItem[];
  effectiveTaxRate: number;
  taxFilingStatus?: TaxFilingStatus;
  additionalTaxRate?: number;
  savingsRate: number;
  charityRate: number;
  audit?: PeriodAudit;
};

export type HouseGoalFields = {
  purchasePriceCents: MoneyCents;
  downPaymentPercent: number;
  closingCostPercent: number;
  interestRatePercent: number;
  loanTermYears: number;
  annualPropertyTaxPercent: number;
  monthlyInsuranceCents: MoneyCents;
  monthlyHoaCents: MoneyCents;
};

export type AmortizationMonth = {
  monthNumber: number;
  paymentCents: MoneyCents;
  principalCents: MoneyCents;
  interestCents: MoneyCents;
  remainingPrincipalCents: MoneyCents;
};

export type HouseAmortization = {
  loanPrincipalCents: MoneyCents;
  monthlyPrincipalInterestCents: MoneyCents;
  monthlyPropertyTaxCents: MoneyCents;
  monthlyInsuranceCents: MoneyCents;
  monthlyHoaCents: MoneyCents;
  totalMonthlyPaymentCents: MoneyCents;
  totalPrincipalCents: MoneyCents;
  totalInterestCents: MoneyCents;
  totalPrincipalInterestCents: MoneyCents;
  firstYearPrincipalCents: MoneyCents;
  firstYearInterestCents: MoneyCents;
  payoffMonths: number;
  schedule: AmortizationMonth[];
};

export type GoalScenario = {
  id: Id;
  name: string;
  type?: GoalType;
  targetDate: LocalDate;
  targetAmountCents: MoneyCents;
  house?: HouseGoalFields;
};

export type Goal = {
  id: Id;
  name: string;
  contributedFromSavingsCents?: MoneyCents;
  notes?: string;
  scenarios: GoalScenario[];
};

export type GoalExecution = {
  goalId: Id;
  scenarioId: Id;
  executedAt: string;
};

export type VariableKind = "money" | "percent";

export type VariableFieldPath =
  | { scope: "plan"; field: "startingSpendableCents" | "startingSavingsCents" }
  | { scope: "costItem"; scenarioId: Id; itemId: Id }
  | {
      scope: "periodItem";
      periodId: Id;
      itemKind: "grossIncome" | "extraExpense";
      itemId: Id;
    }
  | {
      scope: "period";
      periodId: Id;
      field: "additionalTaxRate" | "savingsRate" | "charityRate";
    }
  | { scope: "goal"; goalId: Id; field: "contributedFromSavingsCents" }
  | {
      scope: "goalScenario";
      goalId: Id;
      scenarioId: Id;
      field: "targetAmountCents";
    }
  | {
      scope: "houseField";
      goalId: Id;
      scenarioId: Id;
      field:
        | "purchasePriceCents"
        | "downPaymentPercent"
        | "closingCostPercent"
        | "interestRatePercent"
        | "annualPropertyTaxPercent"
        | "monthlyInsuranceCents"
        | "monthlyHoaCents";
    };

export type Variable = {
  id: Id;
  name: string;
  kind: VariableKind;
  value: number;
  bindings: VariableFieldPath[];
};

export type PlanDocument = {
  id: Id;
  name: string;
  currency: "USD";
  startingSpendableCents: MoneyCents;
  startingSavingsCents: MoneyCents;
  costOfLivingScenarios: CostOfLivingScenario[];
  periods: FinancialPeriod[];
  goals: Goal[];
  executions?: GoalExecution[];
  variables: Variable[];
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectionMonth = {
  month: MonthKey;
  label: string;
  openingSpendableCents: MoneyCents;
  openingSavingsCents: MoneyCents;
  grossIncomeCents: MoneyCents;
  taxCents: MoneyCents;
  afterTaxIncomeCents: MoneyCents;
  costOfLivingCents: MoneyCents;
  extraExpenseCents: MoneyCents;
  charityCents: MoneyCents;
  plannedSavingsCents: MoneyCents;
  netSpendableChangeCents: MoneyCents;
  goalSpendCents: MoneyCents;
  goalEventLabels: string[];
  closingSpendableCents: MoneyCents;
  closingSavingsCents: MoneyCents;
  cumulativeTaxCents: MoneyCents;
  activePeriodIds: Id[];
};

export type PeriodSummary = {
  periodId: Id;
  name: string;
  startDate: LocalDate;
  endDate: LocalDate;
  carryoverInCents: MoneyCents;
  calculatedTaxRate: number;
  annualizedGrossIncomeCents: MoneyCents;
  grossIncomeCents: MoneyCents;
  taxCents: MoneyCents;
  afterTaxIncomeCents: MoneyCents;
  costOfLivingCents: MoneyCents;
  extraExpenseCents: MoneyCents;
  charityCents: MoneyCents;
  plannedSavingsCents: MoneyCents;
  profitCents: MoneyCents;
  spendableEndingCents: MoneyCents;
  savingsEndingCents: MoneyCents;
};

export type GoalResult = {
  goalId: Id;
  goalName: string;
  scenarioId: Id;
  scenarioName: string;
  targetMonth: MonthKey;
  targetDate: LocalDate;
  requiredCashCents: MoneyCents;
  contributedFromSavingsCents: MoneyCents;
  unallocatedAvailableCashCents: MoneyCents;
  availableCashCents: MoneyCents;
  surplusOrShortfallCents: MoneyCents;
  percentFunded: number;
  requiredDownPaymentCents?: MoneyCents;
  requiredClosingCostCents?: MoneyCents;
  availableDownPaymentCents?: MoneyCents;
  availableDownPaymentPercent?: number;
  estimatedMonthlyPaymentCents?: MoneyCents;
  executed: boolean;
  executionUpfrontCents: MoneyCents;
};

export type ProjectionWarning = {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
};

export type ProjectionResult = {
  months: ProjectionMonth[];
  periodSummaries: PeriodSummary[];
  goalResults: GoalResult[];
  warnings: ProjectionWarning[];
  totals: {
    cumulativeTaxCents: MoneyCents;
    endingSpendableCents: MoneyCents;
    endingSavingsCents: MoneyCents;
    reservedGoalContributionCents: MoneyCents;
    endingAvailableCents: MoneyCents;
    endingNetWorthCents: MoneyCents;
  };
};
