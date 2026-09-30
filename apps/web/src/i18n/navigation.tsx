"use client";

import { createNavigation } from "next-intl/navigation";
import { type ComponentProps, useMemo } from "react";
import { type RoutingMode, routingByMode } from "./routing";
import { useRoutingMode } from "./routing-mode-context";

const navigation = {
  always: createNavigation(routingByMode.always),
  never: createNavigation(routingByMode.never),
};

// Language changes go through the preference control: next-intl's locale override
// deliberately adds a prefix, even for its "never" policy, to synchronize cookies.
export function Link(props: Omit<ComponentProps<typeof navigation.always.Link>, "locale">) {
  const LocalizedLink = navigation[useRoutingMode()].Link;
  return <LocalizedLink {...props} />;
}

export function usePathname() {
  const mode = useRoutingMode();
  const always = navigation.always.usePathname();
  const never = navigation.never.usePathname();
  return mode === "always" ? always : never;
}

export function useRouter() {
  const mode = useRoutingMode();
  const always = navigation.always.useRouter();
  const never = navigation.never.useRouter();
  const router = mode === "always" ? always : never;
  type Router = typeof always;
  return useMemo(
    () => ({
      ...router,
      push(
        href: Parameters<Router["push"]>[0],
        options?: Omit<NonNullable<Parameters<Router["push"]>[1]>, "locale">,
      ) {
        return router.push(href, options);
      },
      replace(
        href: Parameters<Router["replace"]>[0],
        options?: Omit<NonNullable<Parameters<Router["replace"]>[1]>, "locale">,
      ) {
        return router.replace(href, options);
      },
      prefetch(
        href: Parameters<Router["prefetch"]>[0],
        options?: Omit<NonNullable<Parameters<Router["prefetch"]>[1]>, "locale">,
      ) {
        return router.prefetch(href, options);
      },
    }),
    [router],
  );
}

export function getPathname(
  mode: RoutingMode,
  args: Parameters<typeof navigation.always.getPathname>[0],
) {
  return navigation[mode].getPathname(args);
}
