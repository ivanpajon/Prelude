"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { MorphIcon } from "@repo/ui/components/morph-icon";
import { cn } from "@repo/ui/lib/utils";
import { Bookmark, BookmarkCheck } from "lucide";
import { ArrowRightIcon } from "lucide-react";
import * as m from "motion/react-m";
import { useState } from "react";

function MotionExample() {
  const [atEnd, setAtEnd] = useState(false);

  return (
    <Card className="h-full bg-card shadow-none">
      <CardContent className="p-6 sm:p-8">
        <Badge variant="secondary">Motion</Badge>
        <h3 className="mt-4 text-lg font-medium">Give a small change some movement.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Choose a position and watch the tile settle into place.
        </p>
        <div
          aria-hidden="true"
          className={cn(
            "my-6 flex h-32 items-center rounded-xl bg-muted px-5",
            atEnd ? "justify-end" : "justify-start",
          )}
        >
          <m.div
            layout="position"
            initial={false}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
            className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
          >
            <ArrowRightIcon className="size-6" />
          </m.div>
        </div>
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Tile position</legend>
          <Button
            variant={atEnd ? "outline" : "default"}
            aria-pressed={!atEnd}
            onClick={() => setAtEnd(false)}
          >
            Start
          </Button>
          <Button
            variant={atEnd ? "default" : "outline"}
            aria-pressed={atEnd}
            onClick={() => setAtEnd(true)}
          >
            End
          </Button>
        </fieldset>
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {atEnd ? "Tile at the end." : "Tile at the start."}
        </p>
      </CardContent>
    </Card>
  );
}

function MorphiconsExample() {
  const [saved, setSaved] = useState(false);

  return (
    <Card className="h-full bg-card shadow-none">
      <CardContent className="p-6 sm:p-8">
        <Badge variant="secondary">Morphicons</Badge>
        <h3 className="mt-4 text-lg font-medium">Let the icon tell the story.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Save an idea and see the bookmark become a confirmation.
        </p>
        <div className="my-6 flex h-32 items-center justify-center rounded-xl bg-muted">
          <MorphIcon icon={saved ? BookmarkCheck : Bookmark} className="size-12 text-primary" />
        </div>
        <Button variant="outline" aria-pressed={saved} onClick={() => setSaved(!saved)}>
          Save idea
        </Button>
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {saved ? "Idea saved in this preview." : "Try saving this idea."}
        </p>
      </CardContent>
    </Card>
  );
}

export function AnimationExamples() {
  return (
    <section className="mt-16" aria-labelledby="animation-heading">
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          A little interaction
        </p>
        <h2 id="animation-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">
          Small details. More life.
        </h2>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <MotionExample />
        <MorphiconsExample />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        These previews reset on reload and follow your device’s reduced-motion setting.
      </p>
    </section>
  );
}
