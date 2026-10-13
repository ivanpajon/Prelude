import { isServer, QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    // Server prefetches fail fast; the browser retries once.
    defaultOptions: { queries: { staleTime: 60_000, retry: isServer ? false : 1 } },
  });
}
