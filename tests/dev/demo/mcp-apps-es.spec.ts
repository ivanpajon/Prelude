import { test } from "@playwright/test";
import { exerciseTaskApp } from "../../demo/mcp-apps";

// playwright.dev.config.ts lists this file last, apart from the other MCP App test, so the
// development shards each get one of them.
test("runs the real Task App in Spanish through the official Inspector", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ locale: "es-ES" });
  try {
    await exerciseTaskApp({
      page: await context.newPage(),
      request: context.request,
      inspectorOrigin: "http://127.0.0.1:6284",
      sandboxOrigin: "http://127.0.0.1:6286",
      locale: "es",
    });
  } finally {
    await context.close();
  }
});
