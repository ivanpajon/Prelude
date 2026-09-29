import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent } from "@repo/ui/components/card";
import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { McpPlayground } from "@/components/mcp-playground";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TaskWorkbenchServer } from "@/components/task-workbench-server";

export const metadata: Metadata = {
  title: "Playground — Prelude",
  description:
    "Try Prelude’s task workspace, explore its live MCP tools, and preview an interactive MCP App.",
};

export default function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
      <SiteHeader activePage="playground" />

      <main id="main-content" className="pb-16">
        <section className="py-16 lg:py-20" aria-labelledby="playground-heading">
          <Badge variant="secondary" className="mb-6 rounded-full px-3 py-1.5 font-medium">
            The foundations in action
          </Badge>
          <h1 id="playground-heading" className="text-4xl font-medium tracking-tight sm:text-5xl">
            A little room to experiment.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Make a task, try an agent’s tool, and see how the pieces work together. These examples
            share the same demo data and are ready to make your own.
          </p>
          <nav aria-label="Playground sections" className="mt-8 flex flex-wrap gap-3">
            {[
              ["#tasks", "Task workspace"],
              ["#mcp", "MCP tools"],
              ["#mcp-app", "MCP App"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                {label}
              </a>
            ))}
          </nav>
        </section>

        <section id="tasks" className="scroll-mt-8" aria-labelledby="workbench-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Make something happen
              </p>
              <h2
                id="workbench-heading"
                className="text-2xl font-medium tracking-tight sm:text-3xl"
              >
                Your workspace, ready.
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">apps/web</span>
          </div>
          <Suspense
            fallback={
              <p role="status" className="rounded-xl bg-card p-8 text-muted-foreground">
                Loading your workspace…
              </p>
            }
          >
            <TaskWorkbenchServer searchParams={searchParams} />
          </Suspense>
        </section>

        <McpPlayground />

        <section id="mcp-app" className="mt-16 scroll-mt-8" aria-labelledby="mcp-app-heading">
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Beyond a text response
            </p>
            <h2 id="mcp-app-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">
              The same tasks. A new place to work.
            </h2>
          </div>
          <Card className="bg-card shadow-none">
            <CardContent className="p-6 sm:p-8">
              <Badge variant="secondary">MCP App</Badge>
              <h3 className="mt-4 text-lg font-medium">Bring the task workspace to your agent.</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Connect an MCP Apps compatible client to this site’s{" "}
                <code className="font-mono text-xs">/api/mcp</code> endpoint, then run{" "}
                <code className="font-mono text-xs">listTasks</code> to open the interactive task
                widget. You can filter, create, complete, and delete tasks from your client.
              </p>
              {process.env.NODE_ENV === "development" ? (
                <>
                  <a
                    href="/api/mcp/inspector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  >
                    Open Inspector
                    <ArrowUpRightIcon className="size-4" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    The local Inspector starts with the development server. Connect and run
                    listTasks to preview the widget.
                  </p>
                </>
              ) : (
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Use this site’s full URL followed by /api/mcp when connecting your client. The
                  Inspector preview is available during local development.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
