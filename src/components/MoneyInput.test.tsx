import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MoneyInput } from "./MoneyInput";

function MoneyInputHarness({ initialValue = 0 }: { initialValue?: number }) {
  const [valueCents, setValueCents] = useState(initialValue);

  return (
    <MoneyInput
      aria-label="Amount"
      valueCents={valueCents}
      onChange={setValueCents}
    />
  );
}

describe("MoneyInput", () => {
  it("allows natural typing before formatting on blur", async () => {
    const user = userEvent.setup();
    render(<MoneyInputHarness />);

    const input = screen.getByLabelText("Amount");

    await user.clear(input);
    await user.type(input, "12");

    expect(input).toHaveValue("12");

    await user.tab();

    expect(input).toHaveValue("12.00");
  });

  it("accepts commas and currency symbols", async () => {
    const user = userEvent.setup();
    render(<MoneyInputHarness initialValue={5000} />);

    const input = screen.getByLabelText("Amount");

    await user.clear(input);
    await user.type(input, "$1,234.56");
    await user.tab();

    expect(input).toHaveValue("1234.56");
  });
});
