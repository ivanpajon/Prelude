"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@repo/ui/lib/utils";

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4.5 translate-x-0 rounded-full bg-background shadow-sm transition-transform group-data-checked/switch:translate-x-4 motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
}
