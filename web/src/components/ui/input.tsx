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
          "flex h-10 w-full rounded-md bg-[#18181b] border border-[#27272a] px-4 py-2 text-sm text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#3f3f46] focus:ring-2 focus:ring-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-40 transition-all duration-150",
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