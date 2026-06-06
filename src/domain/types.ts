export type Id = string;
export type LocalDate = string;
export type MonthKey = string;
export type MoneyCents = number;

export type Cadence = "monthly" | "yearly" | "weekly" | "oneTime";

export type CostItem = {
  id: Id;
  name: string;
  category: string;
  amountCents: MoneyCents;
  cadence: Extract<Cadence, "monthly" | "yearly">;
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
  savingsRate: number;
  charityRate: number;
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

export type GoalScenario = {
  id: Id;
  name: string;
  targetDate: LocalDate;
  targetAmountCents: MoneyCents;
  house?: HouseGoalFields;
};

export type Goal = {
  id: Id;
  name: string;
  notes?: string;
  scenarios: GoalScenario[];
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
  grossIncomeCents: MoneyCents;
  taxCents: MoneyCents;
  afterTaxIncomeCents: MoneyCents;
  costOfLivingCents: MoneyCents;
  extraExpenseCents: MoneyCents;
  charityCents: MoneyCents;
  plannedSavingsCents: MoneyCents;
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
  availableCashCents: MoneyCents;
  surplusOrShortfallCents: MoneyCents;
  percentFunded: number;
  estimatedMonthlyPaymentCents?: MoneyCents;
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
    endingAvailableCents: MoneyCents;
  };
};
