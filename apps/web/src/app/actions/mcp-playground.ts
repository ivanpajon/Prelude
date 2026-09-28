"use server";

import { headers } from "next/headers";
import { createMcpPlayground } from "@/lib/mcp-playground";

const playground = createMcpPlayground();

export async function discoverMcpTools() {
  return playground.discover(new Headers(await headers()));
}

export async function executeMcpTool(name: string, args: Record<string, unknown>) {
  return playground.execute(new Headers(await headers()), name, args);
}
