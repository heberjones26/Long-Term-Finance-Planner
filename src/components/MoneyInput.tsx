import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes
} from "react";
import { centsToDollars, dollarsToCents } from "../domain/money";
import { Input } from "./ui/field";

export function MoneyInput({
  onChange,
  onBlur,
  onFocus,
  valueCents,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  valueCents: number;
  onChange: (valueCents: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(centsToDollars(valueCents));
  const [isFocused, setIsFocused] = useState(false);
  const latestCentsRef = useRef(valueCents);

  useEffect(() => {
    latestCentsRef.current = valueCents;
    if (!isFocused) {
      setDraftValue(centsToDollars(valueCents));
    }
  }, [isFocused, valueCents]);

  return (
    <Input
      inputMode="decimal"
      type="text"
      value={draftValue}
      onBlur={(event) => {
        setIsFocused(false);
        setDraftValue(centsToDollars(latestCentsRef.current));
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        const nextCents = dollarsToCents(nextValue);
        setDraftValue(nextValue);
        latestCentsRef.current = nextCents;
        onChange(nextCents);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      {...props}
    />
  );
}
