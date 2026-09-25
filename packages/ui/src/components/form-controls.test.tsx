import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Input } from "./input";

function ExampleForm({ save }: { save: (title: string) => void }) {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save(title);
      }}
    >
      <label htmlFor="title">Title</label>
      <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Button type="submit" disabled={title.trim().length === 0}>
        Save
      </Button>
    </form>
  );
}

describe("shared form controls", () => {
  it("supports a labeled field and keyboard submission", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<ExampleForm save={save} />);

    await user.tab();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await user.keyboard("Build a feature");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Build a feature");
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(save).toHaveBeenCalledExactlyOnceWith("Build a feature");
  });

  it("keeps the submit action disabled while the draft is empty", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<ExampleForm save={save} />);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(save).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Draft");
    expect(button).toBeEnabled();
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    expect(button).toBeDisabled();
  });
});
