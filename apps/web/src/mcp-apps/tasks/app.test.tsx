import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskApp, TaskAppView } from "./app";
import { TaskAppSession, type TaskAppTools, type ToolCaller } from "./model";

const bridge = vi.hoisted(() => ({
  useApp: vi.fn(),
  useAutoResize: vi.fn(),
  useHostStyleVariables: vi.fn(),
}));
vi.mock("@modelcontextprotocol/ext-apps/react", () => bridge);

const task = { id: "task-1", title: "Build something", completed: false };
const tools = {
  listTasks: "listTasks",
  createTask: "createTask",
  setTaskCompleted: "setTaskCompleted",
};
const result = (value: unknown) => ({ structuredContent: value });
const sessions: TaskAppSession[] = [];

function fixture(config: TaskAppTools = tools) {
  const session = new TaskAppSession(config);
  const call = vi.fn<ToolCaller>();
  session.connect(call);
  session.hostInput({ status: "all" });
  session.hostResult(result([task]));
  sessions.push(session);
  const rendered = render(
    <QueryClientProvider client={session.queryClient}>
      <TaskAppView session={session} />
    </QueryClientProvider>,
  );
  return { session, call, ...rendered };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
});

it("renders host-seeded data accessibly without fetching again and hides excluded mutation controls", async () => {
  const { call } = fixture({ listTasks: "listTasks" });
  expect(screen.getByRole("main", { name: "Prelude task app" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Your tasks, right here." })).toBeVisible();
  expect(within(screen.getByRole("list", { name: "Tasks" })).getByText(task.title)).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("1 tasks in this view");
  expect(screen.queryByRole("textbox", { name: "New task" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Mark / })).not.toBeInTheDocument();
  await Promise.resolve();
  expect(call).not.toHaveBeenCalled();
});

it("creates a trimmed task with the keyboard, refreshes the list, and clears only successful input", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  const created = { ...task, id: "task-2", title: "Ship it" };
  call.mockResolvedValueOnce(result(created)).mockResolvedValueOnce(result([task, created]));
  const input = screen.getByRole("textbox", { name: "New task" });
  await user.click(input);
  await user.type(input, "  Ship it  {Enter}");
  await waitFor(() => expect(input).toHaveValue(""));
  expect(call).toHaveBeenNthCalledWith(
    1,
    "createTask",
    { title: "Ship it" },
    expect.any(AbortSignal),
  );
  await waitFor(() =>
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("Ship it"),
  );
  expect(screen.getByRole("status")).toHaveTextContent("2 tasks in this view");

  call.mockResolvedValueOnce({ isError: true });
  await user.type(input, "Keep this draft{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("The tool could not complete");
  expect(input).toHaveValue("Keep this draft");
});

it("announces invalid input without sending a mutation and permits correcting it", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  await user.type(screen.getByRole("textbox", { name: "New task" }), "   {Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a task between 1 and 120 characters.");
  expect(call).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "New task" })).toHaveAttribute("maxlength", "120");
});

it("preserves a newer draft typed while a successful mutation's follow-up read is pending", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  const created = { ...task, id: "task-2", title: "First draft" };
  let finishRefresh!: (value: unknown) => void;
  call.mockResolvedValueOnce(result(created)).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const input = screen.getByRole("textbox", { name: "New task" });
  await user.type(input, "First draft{Enter}");
  await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  await user.clear(input);
  await user.type(input, "Keep this second draft");
  await act(async () => finishRefresh(result([task, created])));
  await waitFor(() =>
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent("First draft"),
  );
  expect(input).toHaveValue("Keep this second draft");
});

it("filters and completes tasks through named controls while exposing loading and pressed state", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  call.mockResolvedValueOnce(result([task]));
  await user.click(screen.getByRole("button", { name: "Active" }));
  await waitFor(() =>
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveAttribute("aria-busy", "false"),
  );
  expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  expect(call).toHaveBeenCalledWith("listTasks", { status: "active" }, expect.any(AbortSignal));
  call
    .mockResolvedValueOnce(result({ ...task, completed: true }))
    .mockResolvedValueOnce(result([]));
  await user.click(screen.getByRole("button", { name: `Mark ${task.title} as completed` }));
  await screen.findByText("No tasks in this view.");
  expect(call).toHaveBeenCalledWith(
    "setTaskCompleted",
    { id: task.id, completed: true },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("status")).toHaveTextContent("0 tasks in this view");
});

it("wires host events, bridge-only calls, styles, resize, cancellation, and unmount cleanup", async () => {
  type HostApp = {
    ontoolinput?: (event: { arguments: { status: string } }) => void;
    ontoolresult?: (value: unknown) => void;
    ontoolcancelled?: () => void;
    onerror?: () => void;
    request: ReturnType<typeof vi.fn>;
    getHostContext: ReturnType<typeof vi.fn>;
  };
  const hostContext = { theme: "dark" };
  const host: HostApp = { request: vi.fn(), getHostContext: vi.fn(() => hostContext) };
  let initialized = false;
  bridge.useApp.mockImplementation((options: { onAppCreated: (app: HostApp) => void }) => {
    if (!initialized) {
      initialized = true;
      options.onAppCreated(host);
    }
    return { app: host, isConnected: true, error: null };
  });
  const dispose = vi.spyOn(TaskAppSession.prototype, "dispose");
  const rendered = render(<TaskApp tools={tools} />);
  expect(bridge.useApp).toHaveBeenCalledWith(
    expect.objectContaining({ autoResize: false, strict: true }),
  );
  expect(bridge.useAutoResize).toHaveBeenCalledWith(host);
  expect(bridge.useHostStyleVariables).toHaveBeenCalledWith(host, hostContext);
  act(() => {
    host.ontoolinput?.({ arguments: { status: "all" } });
    host.ontoolresult?.(result([task]));
  });
  expect(await screen.findByText(task.title)).toBeVisible();
  expect(host.request).not.toHaveBeenCalled();
  act(() => host.ontoolcancelled?.());
  expect(screen.getByRole("alert")).toHaveTextContent("cancelled");

  host.request.mockImplementation(() => new Promise(() => {}));
  await userEvent.setup().click(screen.getByRole("button", { name: "Refresh tasks" }));
  expect(host.request).toHaveBeenCalledWith(
    { method: "tools/call", params: { name: "listTasks", arguments: { status: "all" } } },
    CallToolResultSchema,
    {
      signal: expect.any(AbortSignal),
      onprogress: expect.any(Function),
      resetTimeoutOnProgress: true,
    },
  );
  const signal = host.request.mock.calls[0]?.[2].signal as AbortSignal;
  rendered.unmount();
  expect(signal.aborted).toBe(true);
  expect(dispose).toHaveBeenCalledOnce();
  dispose.mockRestore();
});

it("shows host connection failures and keeps mutation controls disabled before connection", () => {
  bridge.useApp.mockReturnValue({
    app: undefined,
    isConnected: false,
    error: new Error("Disconnected"),
  });
  render(<TaskApp tools={tools} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to connect to the MCP host.");
  expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh tasks" })).toBeDisabled();
});

import { CallToolResultSchema } from "@modelcontextprotocol/core";
