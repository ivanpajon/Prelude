import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "./toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("shared toaster", () => {
  it("announces a notification and supports keyboard action and dismissal", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.add({
        title: "Update available",
        description: "A new version is ready.",
        timeout: 0,
        actionProps: { children: "Update now", onClick: onAction },
        onClose,
      });
    });

    const notifications = screen.getByRole("region", { name: "Notifications" });
    expect(notifications).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Dismiss notification" })).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    expect(within(notifications).getByText("A new version is ready.")).toBeVisible();
    const action = within(notifications).getByRole("button", { name: "Update now" });
    action.focus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledOnce();
    expect(action).toBeVisible();
    await user.tab();
    expect(screen.getByRole("button", { name: "Dismiss notification" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });

  it("keeps persistent notifications and updates their action in place", async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.add({
        id: "update",
        title: "Update available",
        timeout: 0,
        actionProps: { children: "Update now", onClick: onAction },
      });
    });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText("Update available")).toBeVisible();

    act(() => {
      toast.update("update", {
        title: "Updating…",
        type: "loading",
        actionProps: { children: "Updating…", disabled: true, onClick: onAction },
      });
    });
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();

    act(() => {
      toast.update("update", {
        title: "Couldn’t update",
        type: "error",
        actionProps: { children: "Try again", onClick: onAction },
      });
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  });

  it("translates region and dismissal labels without resetting existing notifications", () => {
    const app = render(<Toaster />);
    act(() => {
      toast.add({ id: "localized", title: "Existing update", timeout: 0 });
    });
    app.rerender(<Toaster dismissLabel="Cerrar notificación" regionLabel="Notificaciones" />);
    expect(screen.getByRole("region", { name: "Notificaciones" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cerrar notificación" })).toBeVisible();
    expect(screen.getByText("Existing update")).toBeVisible();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  });
});
