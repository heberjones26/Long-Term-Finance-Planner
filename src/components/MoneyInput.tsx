import type { InputHTMLAttributes } from "react";
import { centsToDollars, dollarsToCents } from "../domain/money";
import { Input } from "./ui/field";

export function MoneyInput({
  valueCents,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  valueCents: number;
  onChange: (valueCents: number) => void;
}) {
  return (
    <Input
      inputMode="decimal"
      min="0"
      step="0.01"
      type="number"
      value={centsToDollars(valueCents)}
      onChange={(event) => onChange(dollarsToCents(event.target.value))}
      {...props}
    />
  );
}
