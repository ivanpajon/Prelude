"use client";

import { MotionProvider } from "@repo/ui/components/motion-provider";
import { isServer, type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { makeQueryClient } from "@/lib/query-client";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <QueryClientProvider client={getQueryClient()}>
        <MotionProvider>{children}</MotionProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
