"use client";

import { isLocale, type Locale } from "@repo/i18n";
import { unstable_isUnrecognizedActionError, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { setLocalePreferences } from "@/app/actions/locale";
import { getPathname } from "./navigation";
import { isRoutingMode, ROUTING_DEMO_ENABLED, type RoutingMode } from "./routing";
import { RoutingModeContext } from "./routing-mode-context";

/** A choice that failed because a deploy replaced the build; the reloaded page applies it. */
const RETRY_KEY = "routing-preference-retry";

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

const PreferenceContext = createContext<Omit<PreferenceControl, "disabled"> | null>(null);

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
  const retried = useRef(false);
  if (!isLocale(locale)) throw new Error("Unsupported language");

  function change(selectedLocale: Locale, selectedMode: RoutingMode) {
    if (submitting.current || pending || (selectedMode === mode && selectedLocale === locale)) {
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
      } catch (error) {
        // A tab opened before a deploy still holds the old build's action IDs. Reload to get the
        // new build, then apply the choice there once (see the effect below). If the retry fails
        // the same way, the reloaded page is still stale, so show the error instead of looping.
        if (unstable_isUnrecognizedActionError(error) && !retried.current) {
          try {
            sessionStorage.setItem(
              RETRY_KEY,
              JSON.stringify({ locale: selectedLocale, mode: selectedMode }),
            );
          } catch {
            // Without storage, the visitor chooses again after the reload.
          }
          window.location.reload();
          return;
        }
        setFailure(selectedMode === mode ? "locale" : "mode");
      } finally {
        submitting.current = false;
      }
    });
  }

  const retry = useEffectEvent((choice: { locale: Locale; mode: RoutingMode }) =>
    change(choice.locale, ROUTING_DEMO_ENABLED ? choice.mode : mode),
  );
  useEffect(() => {
    let choice: { locale?: unknown; mode?: unknown } | null;
    try {
      choice = JSON.parse(sessionStorage.getItem(RETRY_KEY) ?? "null");
      sessionStorage.removeItem(RETRY_KEY);
    } catch {
      return;
    }
    if (isLocale(choice?.locale) && isRoutingMode(choice?.mode)) {
      retried.current = true;
      retry({ locale: choice.locale, mode: choice.mode });
    }
  }, []);

  return (
    <RoutingModeContext value={mode}>
      <PreferenceContext
        value={{
          locale,
          mode,
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

export function useRoutingPreference(): PreferenceControl {
  const preference = useContext(PreferenceContext);
  // Each control reads readiness itself. If the provider's value changed right after hydration,
  // React would render every streamed Suspense boundary below it that is not revealed yet again.
  const hydrated = useSyncExternalStore(subscribeToReadiness, getClientSnapshot, getServerSnapshot);
  if (!preference) throw new Error("Locale controls require RoutingPreferenceProvider");
  return { ...preference, disabled: preference.pending || !hydrated };
}
