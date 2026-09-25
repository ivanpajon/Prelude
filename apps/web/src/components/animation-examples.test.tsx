import { MotionProvider } from "@repo/ui/components/motion-provider";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { AnimationExamples } from "./animation-examples";

it("keeps keyboard-operated animation previews independent", async () => {
  const user = userEvent.setup();
  render(
    <MotionProvider>
      <AnimationExamples />
    </MotionProvider>,
  );
  const start = screen.getByRole("button", { name: "Start" });
  const end = screen.getByRole("button", { name: "End" });
  const save = screen.getByRole("button", { name: "Save idea" });

  expect(start).toHaveAttribute("aria-pressed", "true");
  expect(end).toHaveAttribute("aria-pressed", "false");
  expect(save).toHaveAttribute("aria-pressed", "false");

  await user.tab();
  expect(start).toHaveFocus();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(end).toHaveAttribute("aria-pressed", "true");
  expect(start).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Tile at the end.")).toHaveAttribute("role", "status");

  await user.tab();
  expect(save).toHaveFocus();
  await user.keyboard(" ");
  expect(save).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Idea saved in this preview.")).toHaveAttribute("role", "status");
  expect(end).toHaveAttribute("aria-pressed", "true");

  await user.keyboard("{Enter}");
  expect(save).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Try saving this idea.")).toBeVisible();
});
