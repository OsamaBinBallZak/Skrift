"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "./utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-processing-600 data-[state=unchecked]:bg-primary-300",
        "focus-visible:ring-2 focus-visible:ring-processing-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary",
        "dark:data-[state=unchecked]:bg-primary-600 dark:data-[state=checked]:bg-processing-500",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full ring-0 transition-transform shadow-sm",
          "bg-white border border-primary-200",
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
          "dark:bg-primary-50 dark:border-primary-300",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
