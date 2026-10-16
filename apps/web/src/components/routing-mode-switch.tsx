"use client";

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
      <div className="flex items-center gap-2 text-xs whitespace-nowrap text-foreground sm:text-sm">
        <label htmlFor={switchId} className="cursor-pointer py-1">
          {t("languageInUrl")}
        </label>
        <Switch
          ref={focusRef}
          id={switchId}
          aria-label={t("languageInUrl")}
          checked={mode === "always"}
          disabled={disabled}
          aria-busy={pending}
          onCheckedChange={(checked) => changeMode(checked ? "always" : "never")}
        />
      </div>
      {failure === "mode" && (
        <p role="alert" className="max-w-56 text-xs text-destructive">
          {t("preferenceError")}
        </p>
      )}
    </div>
  );
}
