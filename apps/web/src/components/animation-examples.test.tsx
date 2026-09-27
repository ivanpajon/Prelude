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
  const move = screen.getByRole("button", { name: "Move to end" });
  const save = screen.getByRole("button", { name: "Save idea" });

  expect(save).toHaveAttribute("aria-pressed", "false");

  await user.tab();
  expect(move).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(move).toHaveAccessibleName("Move to start");
  expect(screen.getByText("Tile at the end.")).toHaveAttribute("role", "status");

  await user.tab();
  expect(save).toHaveFocus();
  await user.keyboard(" ");
  expect(save).toHaveAttribute("aria-pressed", "true");
  expect(save).toHaveAccessibleName("Idea saved");
  expect(screen.getByText("Idea saved in this preview.")).toHaveAttribute("role", "status");
  expect(move).toHaveAccessibleName("Move to start");

  await user.keyboard("{Enter}");
  expect(save).toHaveAttribute("aria-pressed", "false");
  expect(save).toHaveAccessibleName("Save idea");
  expect(screen.getByText("Try saving this idea.")).toBeVisible();
  await user.tab({ shift: true });
  expect(move).toHaveFocus();
  await user.keyboard(" ");
  expect(move).toHaveAccessibleName("Move to end");
  expect(screen.getByText("Tile at the start.")).toBeVisible();
});
