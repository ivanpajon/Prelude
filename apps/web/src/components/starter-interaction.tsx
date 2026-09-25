"use client";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { ArrowRightIcon, CheckIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";

export function StarterInteraction() {
  const [started, setStarted] = useState(false);

  return (
    <Card className="overflow-hidden border-border bg-card shadow-none">
      <CardContent className="grid gap-8 p-6 sm:p-8 md:grid-cols-2 md:items-center md:gap-16">
        <div>
          <p className="text-sm font-medium">Every project begins with a first step.</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            This is your space to experiment. Try the interaction, then turn this canvas into the
            product you have in mind.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 rounded-xl bg-muted p-6">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {started ? (
              <CheckIcon className="size-5" aria-hidden="true" />
            ) : (
              <ArrowRightIcon className="size-5" aria-hidden="true" />
            )}
          </div>
          <p className="text-sm" role="status" aria-live="polite">
            {started ? "First step, taken. Make the next one yours." : "Ready when you are."}
          </p>
          <Button onClick={() => setStarted(!started)} variant={started ? "outline" : "default"}>
            {started ? "Start again" : "Take the first step"}
            {started ? (
              <RotateCcwIcon className="size-4" aria-hidden="true" />
            ) : (
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
