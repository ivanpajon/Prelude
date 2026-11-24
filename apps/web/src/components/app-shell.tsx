import { Separator } from "@repo/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui/components/sidebar";
import { ActivityIcon, BookOpenIcon, FolderKanbanIcon, LayoutDashboardIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { site } from "@/site";
import { AppSidebar } from "./app-sidebar";

/** The pages the sidebar links to: add yours here and to `groups` below. */
export type AppPage = "overview";

/**
 * The app pages' frame: the inset sidebar, a bar that stays on top with the sidebar's toggle and
 * the page's title, then the page.
 */
export async function AppShell({
  page,
  title,
  children,
}: {
  page: AppPage;
  /** The page's h1. */
  title: string;
  children: ReactNode;
}) {
  const t = await getTranslations("Common");
  // shortcut: the sidebar opens expanded on every load, so the pages stay static. To keep its
  // state across reloads, pass defaultOpen from the sidebar_state cookie it already writes.
  return (
    <SidebarProvider>
      <AppSidebar
        // A sample account: pass the signed-in user once the project has authentication.
        user={{ name: "Ada Lovelace", email: "ada@example.com" }}
        labels={{
          home: t("home", { name: site.name }),
          navigation: t("navigation"),
          sidebar: t("sidebar"),
          sidebarDescription: t("sidebarDescription"),
          toggleSidebar: t("toggleSidebar"),
        }}
        groups={[
          {
            label: t("platform"),
            items: [
              {
                href: "/private",
                label: t("overview"),
                icon: <LayoutDashboardIcon aria-hidden="true" />,
                active: page === "overview",
              },
              // Sample items: they scroll to sections of the overview until they get their own pages.
              {
                href: "/private#projects",
                label: t("projects"),
                icon: <FolderKanbanIcon aria-hidden="true" />,
              },
              {
                href: "/private#activity",
                label: t("activity"),
                icon: <ActivityIcon aria-hidden="true" />,
              },
            ],
          },
        ]}
        footer={{
          href: "/api/docs",
          label: t("apiDocs"),
          icon: <BookOpenIcon aria-hidden="true" />,
        }}
      />
      {/* The inset's rounded corners clip the bar until they scroll away, so the stuck bar is
      square. Clip, unlike hidden, doesn't make a scroll container, so the bar still sticks.
      min-w-0: overflow-clip keeps the content's min width, unlike a scroll container. */}
      <SidebarInset className="min-w-0 overflow-clip">
        {/* The bar rounds its own top corners while it sits at the inset's top: Chrome can drop the
        inset's clip on the bar's layer when it repaints. Stuck, it's square again; browsers
        without scroll-state queries keep it square and use the clip. */}
        <header className="scroll-state-container sticky top-0 z-10 h-12 shrink-0">
          <div className="flex h-full items-center gap-2 border-b bg-background px-4 md:unstuck:rounded-t-xl">
            <SidebarTrigger label={t("toggleSidebar")} />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <h1 id="page-title" className="truncate text-base font-medium">
              {title}
            </h1>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 md:px-8">
          <main
            id="main-content"
            aria-labelledby="page-title"
            className="flex flex-1 flex-col gap-8 pt-6 pb-12"
          >
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
