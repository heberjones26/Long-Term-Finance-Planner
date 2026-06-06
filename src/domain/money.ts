export function dollarsToCents(value: string | number): number {
  const numericValue =
    typeof value === "number"
      ? value
      : Number.parseFloat(value.replace(/[$,]/g, ""));
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.round(numericValue * 100);
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number, options?: { compact?: boolean }): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: options?.compact ? 0 : 2,
    minimumFractionDigits: options?.compact ? 0 : 2
  });
  return formatter.format(cents / 100);
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}
