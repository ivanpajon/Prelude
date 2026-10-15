"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () => import("../lib/motion-features").then((module) => module.default);

// Wrap each animated section, not the whole app. LazyMotion updates its context when the features
// load, and above a streamed Suspense boundary that update makes React drop the server HTML.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
