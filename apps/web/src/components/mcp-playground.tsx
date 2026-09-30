"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, CheckIcon, CodeIcon, PlayIcon, TerminalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useStore } from "zustand";
import { discoverMcpTools, executeMcpTool } from "@/app/actions/mcp-playground";
import { mcpResultText, parseArguments, starterArguments } from "@/lib/mcp-playground-format";
import { McpPlaygroundError, type McpPlaygroundResult } from "@/lib/mcp-playground-types";
import { orpc } from "@/lib/orpc";
import { getMcpPlaygroundStore, type McpPlaygroundStoreApi } from "@/stores/mcp-playground-store";

const executionKey = ["mcp-playground", "execution"];

export function McpPlayground({ store: injectedStore }: { store?: McpPlaygroundStoreApi } = {}) {
  const t = useTranslations("Mcp");
  const queryClient = useQueryClient();
  const [store] = useState(() => injectedStore ?? getMcpPlaygroundStore());
  const { selectedName, drafts, inputError, executionVisible, running, setDraft, setArguments } =
    useStore(store);
  const discovery = useQuery({
    queryKey: ["mcp-playground", "tools"],
    queryFn: async () => {
      const response = await discoverMcpTools();
      if (!response.ok) throw new McpPlaygroundError(response.error);
      return response.tools;
    },
    enabled: false,
    retry: false,
  });
  const tools = discovery.data ?? [];
  const tool =
    tools.find((entry) => entry.name === selectedName) ??
    tools.find((entry) => entry.annotations?.readOnlyHint) ??
    tools[0];
  const execution = useMutation({
    mutationKey: executionKey,
    // Preserve the latest response across locale remounts; prune it on the next run.
    gcTime: Infinity,
    mutationFn: async (input: { name: string; args: Record<string, unknown> }) => {
      const response = await executeMcpTool(input.name, input.args);
      if (!response.ok) throw new McpPlaygroundError(response.error);
      return response.result;
    },
    retry: false,
    onSuccess: (result) => {
      // This removable demo shares the workbench's repository across RPC and MCP.
      if (!result.isError) void queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
    },
  });
  const executionStates = useMutationState({
    filters: { mutationKey: executionKey },
    select: (mutation) => ({
      status: mutation.state.status,
      data: mutation.state.data as McpPlaygroundResult | undefined,
      error: mutation.state.error,
    }),
  });
  const currentExecution = executionVisible ? executionStates.at(-1) : undefined;
  const executionPending = running || currentExecution?.status === "pending";
  const draft = tool ? (drafts[tool.name] ?? starterArguments(tool.inputSchema)) : "";
  const errorCode = (error: Error) =>
    error instanceof McpPlaygroundError ? error.code : "errorRequestFailed";
  const error =
    inputError ?? (currentExecution?.error ? errorCode(currentExecution.error) : undefined);

  function resetExecution() {
    execution.reset();
    setDraft({ inputError: undefined, executionVisible: false });
  }

  async function run() {
    if (!tool || store.getState().running) return;
    resetExecution();
    let args: Record<string, unknown>;
    try {
      args = parseArguments(draft);
    } catch (error) {
      setDraft({ inputError: error instanceof McpPlaygroundError ? error.code : "errorArguments" });
      return;
    }
    if (!store.getState().begin()) return;
    // Keep only one completed response; pending execution is guarded synchronously.
    for (const mutation of queryClient.getMutationCache().findAll({ mutationKey: executionKey })) {
      if (mutation.state.status !== "pending") queryClient.getMutationCache().remove(mutation);
    }
    try {
      await execution.mutateAsync({ name: tool.name, args });
    } catch {
      // Keep the draft and let mutation state display a retryable failure.
    } finally {
      store.getState().finish();
    }
  }

  return (
    <section id="mcp" className="mt-16 scroll-mt-8" aria-labelledby="mcp-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {t("eyebrow")}
          </p>
          <h2 id="mcp-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">
            {t("title")}
          </h2>
        </div>
        <span className="font-mono text-xs text-muted-foreground">/api/mcp</span>
      </div>
      <Card className="bg-card shadow-none">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="secondary" className="gap-1.5">
                <TerminalIcon className="size-3" aria-hidden="true" />
                {t("badge")}
              </Badge>
              <h3 className="mt-4 text-lg font-medium">{t("toolsTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("description")}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={discovery.isFetching || executionPending}
              onClick={() => {
                if (store.getState().running) return;
                resetExecution();
                void discovery.refetch();
              }}
            >
              {t(
                discovery.isFetching
                  ? "discovering"
                  : discovery.data
                    ? "refreshTools"
                    : "discoverTools",
              )}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
          <p role="status" className="mt-4 text-xs text-muted-foreground">
            {discovery.isFetching
              ? t("discoveringStatus")
              : discovery.data
                ? t("toolsAvailable", { count: tools.length })
                : t("connectHint")}
          </p>
          {discovery.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {t(errorCode(discovery.error))} {t("discoveryRetry")}
            </p>
          )}
          {discovery.data && tools.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {tool && (
            <>
              <fieldset className="mt-6 flex flex-wrap gap-2">
                <legend className="sr-only">{t("toolsLabel")}</legend>
                {tools.map((entry) => (
                  <Button
                    key={entry.name}
                    variant={entry.name === tool.name ? "default" : "outline"}
                    aria-pressed={entry.name === tool.name}
                    disabled={executionPending}
                    className="max-w-full font-mono text-xs"
                    onClick={() => {
                      if (store.getState().running) return;
                      setDraft({ selectedName: entry.name });
                      resetExecution();
                    }}
                  >
                    <span className="truncate">{entry.name}</span>
                  </Button>
                ))}
              </fieldset>
              <div className="mt-5 flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">
                  {t(tool.annotations?.readOnlyHint ? "readOnly" : "changesData")}
                </Badge>
                <p className="text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="mcp-arguments" className="mb-3 block text-sm font-medium">
                    {t("arguments")}{" "}
                    <span className="font-mono text-xs text-muted-foreground">JSON</span>
                  </label>
                  <textarea
                    id="mcp-arguments"
                    aria-label={`${t("arguments")} JSON`}
                    value={draft}
                    disabled={executionPending}
                    onChange={(event) => {
                      if (store.getState().running) return;
                      setArguments(tool.name, event.target.value);
                      resetExecution();
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-invalid={Boolean(inputError)}
                    aria-describedby={inputError ? "mcp-input-error" : "mcp-arguments-help"}
                    className="h-64 w-full resize-y rounded-xl border border-border bg-muted/50 p-4 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                  />
                  <p id="mcp-arguments-help" className="mt-2 text-xs text-muted-foreground">
                    {t("argumentsHelp")}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 id="mcp-result-heading" className="text-sm font-medium">
                      {t("response")}
                    </h4>
                    <span role="status" className="text-xs text-muted-foreground">
                      {executionPending
                        ? t("running")
                        : currentExecution?.data
                          ? currentExecution.data.isError
                            ? t("toolError")
                            : t("complete")
                          : currentExecution?.status === "error"
                            ? t("requestFailed")
                            : t("ready")}
                    </span>
                  </div>
                  <section
                    aria-labelledby="mcp-result-heading"
                    aria-busy={executionPending}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll long tool responses.
                    tabIndex={0}
                    className={cn(
                      "h-64 overflow-auto rounded-xl border border-border bg-muted/50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      currentExecution?.data?.isError && "border-destructive/40",
                    )}
                  >
                    {currentExecution?.data ? (
                      <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                        {mcpResultText(currentExecution.data)}
                      </pre>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                        <CodeIcon className="size-6" aria-hidden="true" />
                        <p className="text-sm">{t("responsePlaceholder")}</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
              {error && (
                <p id="mcp-input-error" role="alert" className="mt-3 text-sm text-destructive">
                  {t(error, { example: '{ "status": "all" }' })}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  disabled={executionPending || discovery.isFetching}
                  onClick={() => void run()}
                >
                  {currentExecution?.data && !currentExecution.data.isError ? (
                    <CheckIcon aria-hidden="true" />
                  ) : (
                    <PlayIcon aria-hidden="true" />
                  )}
                  {t(executionPending ? "running" : "runTool")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t(tool.annotations?.readOnlyHint ? "readOnlyHint" : "mutationHint")}
                </p>
              </div>
              <details className="mt-6 border-t border-border pt-4">
                <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  {t("viewSchemas")}
                </summary>
                <pre className="mt-4 rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                  {JSON.stringify({ input: tool.inputSchema, output: tool.outputSchema }, null, 2)}
                </pre>
              </details>
            </>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("sharedData")}</p>
    </section>
  );
}
