import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3.5 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-inset)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40 transition-[border-color,box-shadow,background-color] duration-150",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
