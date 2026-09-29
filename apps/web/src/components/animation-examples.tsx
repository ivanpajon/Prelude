"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { MorphIcon } from "@repo/ui/components/morph-icon";
import { cn } from "@repo/ui/lib/utils";
import { Bookmark, BookmarkCheck } from "lucide";
import { ArrowRightIcon } from "lucide-react";
import * as m from "motion/react-m";
import { useTranslations } from "next-intl";
import { useState } from "react";

function MotionExample() {
  const t = useTranslations("Animation");
  const [atEnd, setAtEnd] = useState(false);

  return (
    <Card className="h-full bg-card shadow-none">
      <CardContent className="p-6 sm:p-8">
        <Badge variant="secondary">Motion</Badge>
        <h3 className="mt-4 text-lg font-medium">{t("motionTitle")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("motionDescription")}
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
        <Button variant="outline" onClick={() => setAtEnd((current) => !current)}>
          {t(atEnd ? "moveStart" : "moveEnd")}
        </Button>
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {t(atEnd ? "atEnd" : "atStart")}
        </p>
      </CardContent>
    </Card>
  );
}

function MorphiconsExample() {
  const t = useTranslations("Animation");
  const [saved, setSaved] = useState(false);

  return (
    <Card className="h-full bg-card shadow-none">
      <CardContent className="p-6 sm:p-8">
        <Badge variant="secondary">Morphicons</Badge>
        <h3 className="mt-4 text-lg font-medium">{t("morphTitle")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("morphDescription")}
        </p>
        <div className="my-6 flex h-32 items-center justify-center rounded-xl bg-muted">
          <MorphIcon icon={saved ? BookmarkCheck : Bookmark} className="size-12 text-primary" />
        </div>
        <Button variant="outline" aria-pressed={saved} onClick={() => setSaved(!saved)}>
          {t(saved ? "saved" : "save")}
        </Button>
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {t(saved ? "savedDescription" : "unsavedDescription")}
        </p>
      </CardContent>
    </Card>
  );
}

export function AnimationExamples() {
  const t = useTranslations("Animation");
  return (
    <section className="mt-16" aria-labelledby="animation-heading">
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {t("eyebrow")}
        </p>
        <h2 id="animation-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">
          {t("heading")}
        </h2>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <MotionExample />
        <MorphiconsExample />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("footer")}</p>
    </section>
  );
}
