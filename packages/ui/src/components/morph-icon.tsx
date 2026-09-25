"use client";

import { MorphIcon as BaseMorphIcon } from "morphicons/react";
import type { ComponentProps } from "react";

export type MorphIconProps = ComponentProps<typeof BaseMorphIcon>;

export function MorphIcon({ reducedMotion = "user", ...props }: MorphIconProps) {
  return <BaseMorphIcon {...props} reducedMotion={reducedMotion} />;
}
