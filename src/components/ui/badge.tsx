import * as React from "react";
import { cn } from "../../lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "muted" | "warning" | "success" | "danger";
}) {
  const variants = {
    default: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-amber-100 text-amber-800",
    success: "bg-emerald-100 text-emerald-800",
    danger: "bg-rose-100 text-rose-800"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
