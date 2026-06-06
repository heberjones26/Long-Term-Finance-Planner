import { z } from "zod";

const moneyCentsSchema = z.number().int();
const percentSchema = z.number().min(0).max(100);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const costItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string().min(1),
  amountCents: moneyCentsSchema.nonnegative(),
  cadence: z.enum(["monthly", "yearly"])
});

export const costOfLivingScenarioSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(costItemSchema)
});

export const recurringMoneyItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string().min(1),
  amountCents: moneyCentsSchema.nonnegative(),
  cadence: z.enum(["monthly", "yearly", "weekly", "oneTime"]),
  date: localDateSchema.optional()
});

export const financialPeriodSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    startDate: localDateSchema,
    endDate: localDateSchema,
    costOfLivingScenarioId: z.string(),
    grossIncomeItems: z.array(recurringMoneyItemSchema),
    extraExpenseItems: z.array(recurringMoneyItemSchema),
    effectiveTaxRate: percentSchema,
    savingsRate: percentSchema,
    charityRate: percentSchema
  })
  .refine((period) => period.startDate <= period.endDate, {
    message: "Period start date must be before the end date.",
    path: ["endDate"]
  });

export const houseGoalFieldsSchema = z.object({
  purchasePriceCents: moneyCentsSchema.nonnegative(),
  downPaymentPercent: percentSchema,
  closingCostPercent: percentSchema,
  interestRatePercent: percentSchema,
  loanTermYears: z.number().int().min(1).max(40),
  annualPropertyTaxPercent: percentSchema,
  monthlyInsuranceCents: moneyCentsSchema.nonnegative(),
  monthlyHoaCents: moneyCentsSchema.nonnegative()
});

export const goalScenarioSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  targetDate: localDateSchema,
  targetAmountCents: moneyCentsSchema.nonnegative(),
  house: houseGoalFieldsSchema.optional()
});

export const goalSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  notes: z.string().optional(),
  scenarios: z.array(goalScenarioSchema).min(1)
});

export const planDocumentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  currency: z.literal("USD"),
  startingSpendableCents: moneyCentsSchema,
  startingSavingsCents: moneyCentsSchema,
  costOfLivingScenarios: z.array(costOfLivingScenarioSchema),
  periods: z.array(financialPeriodSchema),
  goals: z.array(goalSchema),
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string()
});
