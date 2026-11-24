import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarProvider, SidebarStateProvider, SidebarTrigger, useSidebar } from "./sidebar";

function State({ page }: { page: string }) {
  return <p>{`${page}: ${useSidebar().state}`}</p>;
}

// Two pages, each with its own provider, as Next.js keeps them in Activity.
function Pages({ shown, review = true }: { shown: "home" | "review"; review?: boolean }) {
  return (
    <SidebarStateProvider>
      {["home", "review"].map((page) =>
        page === "review" && !review ? null : (
          <Activity key={page} mode={shown === page ? "visible" : "hidden"}>
            <SidebarProvider defaultOpen>
              <SidebarTrigger label={`Toggle on ${page}`} />
              <State page={page} />
            </SidebarProvider>
          </Activity>
        ),
      )}
    </SidebarStateProvider>
  );
}

afterEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: the test resets the sidebar's own cookie.
  document.cookie = "sidebar_state=; path=/; max-age=0";
});

describe("SidebarProvider", () => {
  it("shows a page kept by Activity as the sidebar was last left on another page", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Pages shown="review" />);
    rerender(<Pages shown="home" />);
    await user.click(screen.getByRole("button", { name: "Toggle on home" }));
    expect(screen.getByText("home: collapsed")).toBeInTheDocument();

    // The hidden page already follows the toggle, so showing it changes nothing.
    expect(screen.getByText("review: collapsed")).not.toBeVisible();
    rerender(<Pages shown="review" />);
    expect(screen.getByText("review: collapsed")).toBeVisible();
  });

  it("keeps the last toggle over a new page's stale defaultOpen", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Pages shown="home" review={false} />);
    await user.click(screen.getByRole("button", { name: "Toggle on home" }));
    expect(document.cookie).toContain("sidebar_state=false");

    rerender(<Pages shown="review" />);
    expect(screen.getByText("review: collapsed")).toBeVisible();
  });
});
