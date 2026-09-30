import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { McpPlaygroundExecution } from "@/lib/mcp-playground-types";
import { createMcpPlaygroundStore } from "@/stores/mcp-playground-store";
import { McpPlayground } from "./mcp-playground";

const actions = vi.hoisted(() => ({
  discoverMcpTools: vi.fn(),
  executeMcpTool: vi.fn(),
}));
vi.mock("@/app/actions/mcp-playground", () => actions);

const clients: QueryClient[] = [];

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const store = createMcpPlaygroundStore();
  const view = (locale: Locale) => (
    <NextIntlClientProvider
      key={locale}
      locale={locale}
      messages={getMessages(locale)}
      timeZone="UTC"
    >
      <QueryClientProvider client={client}>
        <McpPlayground store={store} />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  const rendered = render(view("en"));
  return {
    ...rendered,
    client,
    store,
    locale: (locale: Locale) => rendered.rerender(view(locale)),
  };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

it("retranslates discovery failures without rediscovering or losing the existing query", async () => {
  const user = userEvent.setup();
  actions.discoverMcpTools.mockResolvedValue({ ok: false, error: "errorDisabled" });
  const { locale } = fixture();
  await user.click(screen.getByRole("button", { name: "Discover tools" }));
  await screen.findByText(/MCP is disabled for this application/);

  locale("es");
  expect(screen.getByRole("alert")).toHaveTextContent("MCP está desactivado en esta aplicación.");
  expect(screen.getByRole("button", { name: "Descubrir herramientas" })).toBeEnabled();
  expect(actions.discoverMcpTools).toHaveBeenCalledOnce();
  expect(actions.executeMcpTool).not.toHaveBeenCalled();
});

it("retains JSON drafts and retranslates validation while preserving protocol titles and results", async () => {
  const user = userEvent.setup();
  actions.discoverMcpTools.mockResolvedValue({
    ok: true,
    tools: [
      {
        name: "listTasks",
        title: "List tasks",
        description: "Public API description in English.",
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: "object",
          required: ["status"],
          properties: { status: { enum: ["all", "active", "completed"] } },
        },
      },
    ],
  });
  const protocolResult = {
    content: [{ type: "text", text: "Public API error in English." }],
    isError: true,
  };
  actions.executeMcpTool.mockResolvedValue({ ok: true, result: protocolResult });
  const { locale } = fixture();
  await user.click(screen.getByRole("button", { name: "Discover tools" }));
  const argumentsInput = await screen.findByRole("textbox", { name: "Arguments JSON" });
  await user.clear(argumentsInput);
  await user.type(argumentsInput, "invalid JSON");
  await user.click(screen.getByRole("button", { name: "Run tool" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    'Enter valid JSON, for example { "status": "all" }.',
  );
  expect(actions.executeMcpTool).not.toHaveBeenCalled();

  locale("es");
  expect(screen.getByRole("textbox", { name: "Argumentos JSON" })).toHaveValue("invalid JSON");
  expect(screen.getByRole("alert")).toHaveTextContent(
    'Introduce un JSON válido, por ejemplo { "status": "all" }.',
  );
  expect(screen.getByRole("button", { name: "listTasks" })).toBeVisible();
  expect(screen.getByText("Public API description in English.")).toBeVisible();

  const translatedInput = screen.getByRole("textbox", { name: "Argumentos JSON" });
  await user.clear(translatedInput);
  await user.type(translatedInput, '{{"status":"active"}');
  await user.click(screen.getByRole("button", { name: "Ejecutar herramienta" }));
  await waitFor(() =>
    expect(actions.executeMcpTool).toHaveBeenCalledWith("listTasks", { status: "active" }),
  );
  await screen.findByText("Public API error in English.");
  expect(screen.getByText("La herramienta ha devuelto un error")).toBeVisible();
  locale("en");
  expect(screen.getByText("Public API error in English.")).toBeVisible();
  expect(actions.discoverMcpTools).toHaveBeenCalledOnce();
  expect(actions.executeMcpTool).toHaveBeenCalledOnce();
});

it("keeps pending execution and its result across locale remounts without duplicate calls", async () => {
  const user = userEvent.setup();
  actions.discoverMcpTools.mockResolvedValue({
    ok: true,
    tools: [
      { name: "listTasks", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
    ],
  });
  let complete!: (value: McpPlaygroundExecution) => void;
  actions.executeMcpTool.mockReturnValue(
    new Promise<McpPlaygroundExecution>((resolve) => {
      complete = resolve;
    }),
  );
  const { locale, client } = fixture();
  await user.click(screen.getByRole("button", { name: "Discover tools" }));
  await screen.findByRole("button", { name: "Run tool" });
  await user.click(screen.getByRole("button", { name: "Run tool" }));
  expect(actions.executeMcpTool).toHaveBeenCalledOnce();

  locale("es");
  const running = screen.getByRole("button", { name: "Ejecutando…" });
  expect(running).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Argumentos JSON" })).toBeDisabled();
  fireEvent.click(running);
  expect(actions.executeMcpTool).toHaveBeenCalledOnce();
  await act(async () =>
    complete({
      ok: true,
      result: { content: [], structuredContent: { title: "Original protocol output" } },
    }),
  );
  await screen.findByText(/Original protocol output/);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Ejecutar herramienta" })).toBeEnabled(),
  );
  locale("en");
  expect(screen.getByText(/Original protocol output/)).toBeVisible();
  expect(screen.getByText("Complete", { exact: true })).toBeVisible();
  expect(
    client.getMutationCache().findAll({ mutationKey: ["mcp-playground", "execution"] }),
  ).toHaveLength(1);
});
