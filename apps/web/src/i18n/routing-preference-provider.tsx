"use client";

import { isLocale, type Locale } from "@repo/i18n";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { setLocalePreferences } from "@/app/actions/locale";
import { getPathname } from "./navigation";
import { ROUTING_DEMO_ENABLED, type RoutingMode } from "./routing";
import { RoutingModeContext } from "./routing-mode-context";

// React reads false during SSR/initial hydration, then true once handlers attach.
const subscribeToReadiness = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

type PreferenceControl = {
  locale: Locale;
  mode: RoutingMode;
  disabled: boolean;
  pending: boolean;
  failure: "locale" | "mode" | null;
  changeLocale: (locale: Locale) => void;
  changeMode: (mode: RoutingMode) => void;
};

const PreferenceContext = createContext<PreferenceControl | null>(null);

export function RoutingPreferenceProvider({
  mode,
  children,
}: {
  mode: RoutingMode;
  children: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<PreferenceControl["failure"]>(null);
  const submitting = useRef(false);
  const hydrated = useSyncExternalStore(subscribeToReadiness, getClientSnapshot, getServerSnapshot);
  if (!isLocale(locale)) throw new Error("Unsupported language");

  function change(selectedLocale: Locale, selectedMode: RoutingMode) {
    if (
      submitting.current ||
      pending ||
      !hydrated ||
      (selectedMode === mode && selectedLocale === locale)
    ) {
      return;
    }
    submitting.current = true;
    setFailure(null);
    // Read query/hash at interaction time, keeping the document statically renderable.
    const current = new URL(window.location.href);
    const pathname =
      mode === "always" ? current.pathname.replace(/^\/[^/]*/, "") || "/" : current.pathname;
    startTransition(async () => {
      try {
        const destination = new URL(
          getPathname(selectedMode, { locale: selectedLocale, href: pathname }),
          current.origin,
        );
        if (destination.origin !== current.origin) throw new Error("Unsupported destination");
        destination.search = current.search;
        destination.hash = current.hash;
        await setLocalePreferences({ locale: selectedLocale, mode: selectedMode });
        if (selectedMode === mode && selectedMode === "never") {
          router.refresh();
        } else {
          router.replace(`${destination.pathname}${destination.search}${destination.hash}`, {
            scroll: false,
          });
        }
      } catch {
        setFailure(selectedMode === mode ? "locale" : "mode");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <RoutingModeContext value={mode}>
      <PreferenceContext
        value={{
          locale,
          mode,
          disabled: pending || !hydrated,
          pending,
          failure,
          changeLocale: (selected) => change(selected, mode),
          changeMode: (selected) => {
            if (ROUTING_DEMO_ENABLED) change(locale, selected);
          },
        }}
      >
        {children}
      </PreferenceContext>
    </RoutingModeContext>
  );
}

export function useRoutingPreference() {
  const preference = useContext(PreferenceContext);
  if (!preference) throw new Error("Locale controls require RoutingPreferenceProvider");
  return preference;
}
