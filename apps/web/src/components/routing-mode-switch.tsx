"use client";

import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Switch } from "@repo/ui/components/switch";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { ROUTING_DEMO_ENABLED } from "@/i18n/routing";
import { useFocusAfterChange, useRoutingPreference } from "@/i18n/routing-preference-provider";

export function RoutingModeSwitch() {
  const t = useTranslations("Common");
  const { mode, disabled, pending, failure, changeMode } = useRoutingPreference();
  const switchId = useId();
  const focusRef = useFocusAfterChange("mode");
  if (!ROUTING_DEMO_ENABLED) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <Field orientation="horizontal" className="w-auto">
        <FieldLabel htmlFor={switchId} className="whitespace-nowrap">
          {t("languageInUrl")}
        </FieldLabel>
        <Switch
          ref={focusRef}
          id={switchId}
          aria-label={t("languageInUrl")}
          checked={mode === "always"}
          disabled={disabled}
          aria-busy={pending}
          onCheckedChange={(checked) => changeMode(checked ? "always" : "never")}
        />
      </Field>
      {failure === "mode" && <FieldError className="max-w-56">{t("preferenceError")}</FieldError>}
    </div>
  );
}
