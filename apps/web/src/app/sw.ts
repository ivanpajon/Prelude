/// <reference lib="webworker" />

import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.mode === "navigate" }],
  },
});

self.addEventListener("install", serwist.handleInstall);
self.addEventListener("activate", serwist.handleActivate);
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // RPC and RSC always use the network, even when the URL matches a precached page.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("accept")?.includes("text/x-component") ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }
  serwist.handleFetch(event);
});
