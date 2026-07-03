import { Link2, Unlink, Variable as VariableIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes
} from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { formatMoney } from "../domain/money";
import type { Variable, VariableFieldPath, VariableKind } from "../domain/types";
import {
  describeFieldPath,
  findVariableForPath,
  isBindingLive,
  pathKind
} from "../domain/variables";
import { usePlannerStore } from "../store/plannerStore";
import { cn } from "../lib/utils";
import { MoneyInput } from "./MoneyInput";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input, Label } from "./ui/field";

type MoneyFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> & {
  path: VariableFieldPath;
  valueCents: number;
  onChange: (valueCents: number) => void;
  suggestedName?: string;
};

export function MoneyVariableField({
  path,
  valueCents,
  onChange,
  suggestedName,
  ...inputProps
}: MoneyFieldProps) {
  const variable = useBoundVariable(path);

  return (
    <div className="flex items-center gap-1.5">
      <MoneyInput
        {...inputProps}
        disabled={inputProps.disabled || Boolean(variable)}
        onChange={onChange}
        valueCents={variable ? variable.value : valueCents}
      />
      <VariableTrigger path={path} suggestedName={suggestedName} variable={variable} />
    </div>
  );
}

type PercentFieldProps = {
  path: VariableFieldPath;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  suggestedName?: string;
  "aria-label"?: string;
};

export function PercentVariableField({
  path,
  value,
  onChange,
  disabled,
  suggestedName,
  "aria-label": ariaLabel
}: PercentFieldProps) {
  const variable = useBoundVariable(path);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        aria-label={ariaLabel}
        disabled={disabled || Boolean(variable)}
        max="100"
        min="0"
        step="0.1"
        type="number"
        value={variable ? variable.value : value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
      <VariableTrigger path={path} suggestedName={suggestedName} variable={variable} />
    </div>
  );
}

function useBoundVariable(path: VariableFieldPath): Variable | undefined {
  const plan = usePlannerStore((state) => state.plan);
  if (!plan) {
    return undefined;
  }
  return findVariableForPath(plan.variables, path);
}

function VariableTrigger({
  path,
  suggestedName,
  variable
}: {
  path: VariableFieldPath;
  suggestedName?: string;
  variable: Variable | undefined;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const plan = usePlannerStore((state) => state.plan);

  // A field can only become a variable once it exists in the saved plan.
  // This keeps freshly-added, unsaved table rows from spawning dead variables.
  const canBind = plan ? isBindingLive(plan, path) : false;
  if (!variable && !canBind) {
    return null;
  }

  return (
    <>
      <button
        aria-label={
          variable
            ? `Manage variable ${variable.name}`
            : "Turn this field into a variable"
        }
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors",
          variable
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <VariableIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {variable ? (
          <span className="max-w-[7rem] truncate">{variable.name}</span>
        ) : null}
      </button>
      {open ? (
        <VariablePopover
          anchor={triggerRef}
          onClose={() => setOpen(false)}
          path={path}
          suggestedName={suggestedName}
          variable={variable}
        />
      ) : null}
    </>
  );
}

function VariablePopover({
  anchor,
  onClose,
  path,
  suggestedName,
  variable
}: {
  anchor: React.RefObject<HTMLButtonElement>;
  onClose: () => void;
  path: VariableFieldPath;
  suggestedName?: string;
  variable: Variable | undefined;
}) {
  const plan = usePlannerStore((state) => state.plan);
  const createVariableFromField = usePlannerStore(
    (state) => state.createVariableFromField
  );
  const bindFieldToVariable = usePlannerStore(
    (state) => state.bindFieldToVariable
  );
  const unbindField = usePlannerStore((state) => state.unbindField);
  const setVariableValue = usePlannerStore((state) => state.setVariableValue);

  const kind: VariableKind = pathKind(path);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [newName, setNewName] = useState(
    suggestedName ?? defaultVariableName(plan, path)
  );

  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const width = 288;
    const left = Math.max(
      12,
      Math.min(rect.right - width, window.innerWidth - width - 12)
    );
    setPosition({ top: rect.bottom + 8, left });
  }, [anchor]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (
        panelRef.current?.contains(event.target as Node) ||
        anchor.current?.contains(event.target as Node)
      ) {
        return;
      }
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handleScroll = () => onClose();

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [anchor, onClose]);

  const sameKindVariables = (plan?.variables ?? []).filter(
    (candidate) => candidate.kind === kind && candidate.id !== variable?.id
  );

  return createPortal(
    <div
      className="fixed z-[200] w-72 rounded-md border border-border bg-card p-4 text-card-foreground shadow-soft"
      ref={panelRef}
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? "visible" : "hidden"
      }}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {plan ? describeFieldPath(plan, path) : ""}
      </p>

      {variable ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="default">{variable.name}</Badge>
            <span className="text-xs text-muted-foreground">
              {variable.bindings.length} field
              {variable.bindings.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>Shared value</Label>
            <VariableValueInput
              kind={kind}
              onChange={(value) => void setVariableValue(variable.id, value)}
              value={variable.value}
            />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              onClick={() => {
                void unbindField(path);
                onClose();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
              Unlink
            </Button>
            <Link
              className="text-xs font-medium text-primary hover:underline"
              onClick={onClose}
              to="/variables"
            >
              Manage all →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newName.trim()) {
                return;
              }
              void createVariableFromField(newName, path);
              onClose();
            }}
          >
            <Label>New variable name</Label>
            <Input
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Monthly rent"
              value={newName}
            />
            <Button className="w-full" size="sm" type="submit">
              <VariableIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Create variable
            </Button>
          </form>

          {sameKindVariables.length ? (
            <div className="space-y-2 border-t border-border pt-3">
              <Label>Link to existing</Label>
              <div className="space-y-1">
                {sameKindVariables.map((candidate) => (
                  <button
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-accent"
                    key={candidate.id}
                    onClick={() => {
                      void bindFieldToVariable(candidate.id, path);
                      onClose();
                    }}
                    type="button"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{candidate.name}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatVariableValue(candidate.value, candidate.kind)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>,
    document.body
  );
}

export function VariableValueInput({
  kind,
  onChange,
  value,
  ...props
}: {
  kind: VariableKind;
  onChange: (value: number) => void;
  value: number;
} & { "aria-label"?: string }) {
  if (kind === "money") {
    return <MoneyInput onChange={onChange} valueCents={value} {...props} />;
  }
  return (
    <Input
      max="100"
      min="0"
      step="0.1"
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      {...props}
    />
  );
}

function formatVariableValue(value: number, kind: VariableKind): string {
  return kind === "money" ? formatMoney(value) : `${value}%`;
}

function defaultVariableName(
  plan: ReturnType<typeof usePlannerStore.getState>["plan"],
  path: VariableFieldPath
): string {
  if (!plan) {
    return "New variable";
  }
  const description = describeFieldPath(plan, path);
  const lastSegment = description.split("·").pop()?.trim();
  return lastSegment || "New variable";
}
