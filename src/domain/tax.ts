import type {
  FinancialPeriod,
  MoneyCents,
  RecurringMoneyItem,
  TaxFilingStatus
} from "./types";

type TaxBracket = {
  thresholdCents: MoneyCents;
  rate: number;
};

export const taxFilingStatusLabels: Record<TaxFilingStatus, string> = {
  single: "Single",
  marriedJoint: "Married filing jointly",
  headOfHousehold: "Head of household",
  marriedSeparate: "Married filing separately"
};

const standardDeductionCents: Record<TaxFilingStatus, MoneyCents> = {
  single: 1610000,
  marriedJoint: 3220000,
  headOfHousehold: 2415000,
  marriedSeparate: 1610000
};

const federalBrackets: Record<TaxFilingStatus, TaxBracket[]> = {
  marriedJoint: [
    { thresholdCents: 0, rate: 10 },
    { thresholdCents: 2480000, rate: 12 },
    { thresholdCents: 10080000, rate: 22 },
    { thresholdCents: 21140000, rate: 24 },
    { thresholdCents: 40355000, rate: 32 },
    { thresholdCents: 51245000, rate: 35 },
    { thresholdCents: 76870000, rate: 37 }
  ],
  headOfHousehold: [
    { thresholdCents: 0, rate: 10 },
    { thresholdCents: 1770000, rate: 12 },
    { thresholdCents: 6745000, rate: 22 },
    { thresholdCents: 10570000, rate: 24 },
    { thresholdCents: 20175000, rate: 32 },
    { thresholdCents: 25620000, rate: 35 },
    { thresholdCents: 64060000, rate: 37 }
  ],
  single: [
    { thresholdCents: 0, rate: 10 },
    { thresholdCents: 1240000, rate: 12 },
    { thresholdCents: 5040000, rate: 22 },
    { thresholdCents: 10570000, rate: 24 },
    { thresholdCents: 20177500, rate: 32 },
    { thresholdCents: 25622500, rate: 35 },
    { thresholdCents: 64060000, rate: 37 }
  ],
  marriedSeparate: [
    { thresholdCents: 0, rate: 10 },
    { thresholdCents: 1240000, rate: 12 },
    { thresholdCents: 5040000, rate: 22 },
    { thresholdCents: 10570000, rate: 24 },
    { thresholdCents: 20177500, rate: 32 },
    { thresholdCents: 25622500, rate: 35 },
    { thresholdCents: 38435000, rate: 37 }
  ]
};

const socialSecurityRate = 6.2;
const socialSecurityWageBaseCents = 18450000;
const medicareRate = 1.45;

export function calculatePeriodTaxProfile(period: FinancialPeriod): {
  annualizedGrossIncomeCents: MoneyCents;
  calculatedTaxRate: number;
  annualFederalIncomeTaxCents: MoneyCents;
  annualFicaTaxCents: MoneyCents;
  annualAdditionalTaxCents: MoneyCents;
  annualTotalTaxCents: MoneyCents;
} {
  const annualizedGrossIncomeCents = annualizeIncomeItems(
    period.grossIncomeItems
  );
  const filingStatus = period.taxFilingStatus ?? "single";
  const annualFederalIncomeTaxCents = calculateFederalIncomeTaxCents(
    annualizedGrossIncomeCents,
    filingStatus
  );
  const annualFicaTaxCents = calculateFicaTaxCents(annualizedGrossIncomeCents);
  const annualAdditionalTaxCents = Math.round(
    annualizedGrossIncomeCents * ((period.additionalTaxRate ?? 0) / 100)
  );
  const annualTotalTaxCents =
    annualFederalIncomeTaxCents + annualFicaTaxCents + annualAdditionalTaxCents;

  return {
    annualizedGrossIncomeCents,
    calculatedTaxRate:
      annualizedGrossIncomeCents === 0
        ? 0
        : (annualTotalTaxCents / annualizedGrossIncomeCents) * 100,
    annualFederalIncomeTaxCents,
    annualFicaTaxCents,
    annualAdditionalTaxCents,
    annualTotalTaxCents
  };
}

export function calculateFederalIncomeTaxCents(
  annualGrossIncomeCents: MoneyCents,
  filingStatus: TaxFilingStatus
): MoneyCents {
  const taxableIncomeCents = Math.max(
    annualGrossIncomeCents - standardDeductionCents[filingStatus],
    0
  );
  const brackets = federalBrackets[filingStatus];
  let taxCents = 0;

  for (let index = 0; index < brackets.length; index += 1) {
    const bracket = brackets[index];
    const nextThreshold = brackets[index + 1]?.thresholdCents ?? Infinity;
    const taxableInBracket = Math.min(
      Math.max(taxableIncomeCents - bracket.thresholdCents, 0),
      nextThreshold - bracket.thresholdCents
    );

    if (taxableInBracket <= 0) {
      continue;
    }

    taxCents += taxableInBracket * (bracket.rate / 100);
  }

  return Math.round(taxCents);
}

export function calculateFicaTaxCents(
  annualGrossIncomeCents: MoneyCents
): MoneyCents {
  const socialSecurityTaxCents =
    Math.min(annualGrossIncomeCents, socialSecurityWageBaseCents) *
    (socialSecurityRate / 100);
  const medicareTaxCents = annualGrossIncomeCents * (medicareRate / 100);

  return Math.round(socialSecurityTaxCents + medicareTaxCents);
}

function annualizeIncomeItems(items: RecurringMoneyItem[]): MoneyCents {
  return items.reduce((total, item) => {
    if (item.enabled === false) {
      return total;
    }
    if (item.cadence === "monthly") {
      return total + item.amountCents * 12;
    }
    if (item.cadence === "weekly") {
      return total + item.amountCents * 52;
    }
    if (item.cadence === "yearly") {
      return total + item.amountCents;
    }
    return total + item.amountCents;
  }, 0);
}
