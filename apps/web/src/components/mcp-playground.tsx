"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, CheckIcon, CodeIcon, PlayIcon, TerminalIcon } from "lucide-react";
import { useRef, useState } from "react";
import { discoverMcpTools, executeMcpTool } from "@/app/actions/mcp-playground";
import { mcpResultText, parseArguments, starterArguments } from "@/lib/mcp-playground-format";
import { orpc } from "@/lib/orpc";

export function McpPlayground() {
  const queryClient = useQueryClient();
  const [selectedName, setSelectedName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [inputError, setInputError] = useState<string>();
  const running = useRef(false);
  const discovery = useQuery({
    queryKey: ["mcp-playground", "tools"],
    queryFn: async () => {
      const response = await discoverMcpTools();
      if (!response.ok) throw new Error(response.error);
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
    mutationFn: async (input: { name: string; args: Record<string, unknown> }) => {
      const response = await executeMcpTool(input.name, input.args);
      if (!response.ok) throw new Error(response.error);
      return response.result;
    },
    retry: false,
    onSuccess: (result) => {
      // This removable demo shares the workbench's repository across RPC and MCP.
      if (!result.isError) void queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
    },
  });
  const draft = tool ? (drafts[tool.name] ?? starterArguments(tool.inputSchema)) : "";
  const error = inputError ?? execution.error?.message;

  async function run() {
    if (!tool || running.current) return;
    setInputError(undefined);
    execution.reset();
    let args: Record<string, unknown>;
    try {
      args = parseArguments(draft);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Check your JSON arguments.");
      return;
    }
    running.current = true;
    try {
      await execution.mutateAsync({ name: tool.name, args });
    } catch {
      // Keep the draft and let mutation state display a retryable failure.
    } finally {
      running.current = false;
    }
  }

  return (
    <section id="mcp" className="mt-16 scroll-mt-8" aria-labelledby="mcp-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Ready for agents
          </p>
          <h2 id="mcp-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">
            A little input. Real action.
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
                MCP playground
              </Badge>
              <h3 className="mt-4 text-lg font-medium">Try the tools your agent can use.</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Discover a tool, edit its arguments, and see what comes back.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={discovery.isFetching || execution.isPending}
              onClick={() => {
                execution.reset();
                setInputError(undefined);
                void discovery.refetch();
              }}
            >
              {discovery.isFetching
                ? "Discovering…"
                : discovery.data
                  ? "Refresh tools"
                  : "Discover tools"}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
          <p role="status" className="mt-4 text-xs text-muted-foreground">
            {discovery.isFetching
              ? "Discovering available tools…"
              : discovery.data
                ? `${tools.length} tools available. Nothing runs until you choose Run tool.`
                : "Connect to explore this app’s live MCP tools."}
          </p>
          {discovery.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {discovery.error.message} Use Discover tools to try again.
            </p>
          )}
          {discovery.data && tools.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              This server has no available tools.
            </p>
          )}
          {tool && (
            <>
              <fieldset className="mt-6 flex flex-wrap gap-2">
                <legend className="sr-only">MCP tools</legend>
                {tools.map((entry) => (
                  <Button
                    key={entry.name}
                    variant={entry.name === tool.name ? "default" : "outline"}
                    aria-pressed={entry.name === tool.name}
                    disabled={execution.isPending}
                    className="max-w-full font-mono text-xs"
                    onClick={() => {
                      setSelectedName(entry.name);
                      setInputError(undefined);
                      execution.reset();
                    }}
                  >
                    <span className="truncate">{entry.name}</span>
                  </Button>
                ))}
              </fieldset>
              <div className="mt-5 flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">
                  {tool.annotations?.readOnlyHint ? "Read only" : "Changes data"}
                </Badge>
                <p className="text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="mcp-arguments" className="mb-3 block text-sm font-medium">
                    Arguments <span className="font-mono text-xs text-muted-foreground">JSON</span>
                  </label>
                  <textarea
                    id="mcp-arguments"
                    value={draft}
                    disabled={execution.isPending}
                    onChange={(event) => {
                      setDrafts((current) => ({ ...current, [tool.name]: event.target.value }));
                      setInputError(undefined);
                      execution.reset();
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-invalid={Boolean(inputError)}
                    aria-describedby={inputError ? "mcp-input-error" : "mcp-arguments-help"}
                    className="h-64 w-full resize-y rounded-xl border border-border bg-muted/50 p-4 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                  />
                  <p id="mcp-arguments-help" className="mt-2 text-xs text-muted-foreground">
                    Starter values are editable. Check the schema for required fields.
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 id="mcp-result-heading" className="text-sm font-medium">
                      Response
                    </h4>
                    <span role="status" className="text-xs text-muted-foreground">
                      {execution.isPending
                        ? "Running…"
                        : execution.data
                          ? execution.data.isError
                            ? "Tool returned an error"
                            : "Complete"
                          : execution.isError
                            ? "Request failed"
                            : "Ready when you are"}
                    </span>
                  </div>
                  <section
                    aria-labelledby="mcp-result-heading"
                    aria-busy={execution.isPending}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll long tool responses.
                    tabIndex={0}
                    className={cn(
                      "h-64 overflow-auto rounded-xl border border-border bg-muted/50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      execution.data?.isError && "border-destructive/40",
                    )}
                  >
                    {execution.data ? (
                      <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                        {mcpResultText(execution.data)}
                      </pre>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                        <CodeIcon className="size-6" aria-hidden="true" />
                        <p className="text-sm">Your tool’s response will appear here.</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
              {error && (
                <p id="mcp-input-error" role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  disabled={execution.isPending || discovery.isFetching}
                  onClick={() => void run()}
                >
                  {execution.data && !execution.data.isError ? (
                    <CheckIcon aria-hidden="true" />
                  ) : (
                    <PlayIcon aria-hidden="true" />
                  )}
                  {execution.isPending ? "Running…" : "Run tool"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {tool.annotations?.readOnlyHint
                    ? "This tool reads data."
                    : "This tool changes the shared demo data."}
                </p>
              </div>
              <details className="mt-6 border-t border-border pt-4">
                <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  View tool schemas
                </summary>
                <pre className="mt-4 rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                  {JSON.stringify({ input: tool.inputSchema, output: tool.outputSchema }, null, 2)}
                </pre>
              </details>
            </>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Live tools, shared demo data. Successful calls refresh the workspace above. Data resets when
        the server restarts.
      </p>
    </section>
  );
}
