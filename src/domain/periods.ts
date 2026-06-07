import { format } from "date-fns";
import type { FinancialPeriod, LocalDate } from "./types";

export function getTodayLocalDate(date = new Date()): LocalDate {
  return format(date, "yyyy-MM-dd");
}

export function isPeriodCurrent(
  period: FinancialPeriod,
  today: LocalDate = getTodayLocalDate()
): boolean {
  return period.startDate <= today && today <= period.endDate;
}

export function isPeriodPast(
  period: FinancialPeriod,
  today: LocalDate = getTodayLocalDate()
): boolean {
  return period.endDate < today;
}
