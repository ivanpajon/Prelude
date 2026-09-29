import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskApp, TaskAppView, WidgetIntlProvider, WidgetStartupError, widgetLocale } from "./app";
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
  updateTaskTitle: "updateTaskTitle",
  deleteTask: "deleteTask",
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
    <WidgetIntlProvider locale="en">
      <QueryClientProvider client={session.queryClient}>
        <TaskAppView session={session} />
      </QueryClientProvider>
    </WidgetIntlProvider>,
  );
  return { session, call, ...rendered };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.restoreAllMocks();
});

it("renders host-seeded data accessibly without fetching again and hides excluded mutation controls", async () => {
  const { call } = fixture({ listTasks: "listTasks" });
  expect(screen.getByRole("main", { name: "Prelude task app" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Your tasks, right here." })).toBeVisible();
  expect(within(screen.getByRole("list", { name: "Tasks" })).getByText(task.title)).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("1 task in this view");
  expect(screen.queryByRole("textbox", { name: "New task" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Mark / })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
  await Promise.resolve();
  expect(call).not.toHaveBeenCalled();
});

it("edits through the renamed tool, trims the title, preserves the create draft, and restores focus", async () => {
  const user = userEvent.setup();
  const { call } = fixture({ ...tools, updateTaskTitle: "rename_task" });
  const createdDraft = screen.getByRole("textbox", { name: "New task" });
  await user.type(createdDraft, "Keep my next task");
  const edit = screen.getByRole("button", { name: `Edit ${task.title}` });
  expect(edit).toHaveAttribute("title", "Edit task");
  expect(edit.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  edit.focus();
  await user.keyboard("{Enter}");
  const title = screen.getByRole("textbox", { name: "Task title" });
  expect(title).toHaveFocus();
  expect(title).toHaveValue(task.title);
  expect((title as HTMLInputElement).selectionStart).toBe(0);
  expect((title as HTMLInputElement).selectionEnd).toBe(task.title.length);
  const updated = { ...task, title: "A better title" };
  call.mockResolvedValueOnce(result(updated)).mockResolvedValueOnce(result([updated]));
  await user.keyboard("  A better title  {Enter}");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: `Edit ${updated.title}` })).toHaveFocus(),
  );
  expect(call).toHaveBeenNthCalledWith(
    1,
    "rename_task",
    { id: task.id, title: updated.title },
    expect.any(AbortSignal),
  );
  expect(call).toHaveBeenNthCalledWith(2, "listTasks", { status: "all" }, expect.any(AbortSignal));
  expect(screen.queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent(updated.title);
  expect(createdDraft).toHaveValue("Keep my next task");
});

it("cancels editing with Escape or Cancel without a write and restores the original title", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  for (const method of ["Escape", "Cancel"]) {
    await user.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
    await user.keyboard("Unsubmitted change");
    if (method === "Escape") await user.keyboard("{Escape}");
    else await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Edit ${task.title}` })).toHaveFocus();
    expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent(task.title);
  }
  expect(call).not.toHaveBeenCalled();
});

it("validates normalized edited titles without dispatching and permits a 120-character title", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  await user.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
  const title = screen.getByRole("textbox", { name: "Task title" });
  for (const invalid of ["   ", "x".repeat(121)]) {
    fireEvent.change(title, { target: { value: invalid } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("between 1 and 120 characters");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveFocus();
    expect(title).toHaveValue(invalid);
    expect(call).not.toHaveBeenCalled();
  }
  const updated = { ...task, title: "x".repeat(120) };
  call.mockResolvedValueOnce(result(updated)).mockResolvedValueOnce(result([updated]));
  fireEvent.change(title, { target: { value: `  ${updated.title}  ` } });
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument(),
  );
  expect(call).toHaveBeenNthCalledWith(
    1,
    "updateTaskTitle",
    { id: task.id, title: updated.title },
    expect.any(AbortSignal),
  );
});

it("preserves failed edit drafts and blocks duplicate submissions through the follow-up refresh", async () => {
  const user = userEvent.setup();
  const { call } = fixture();
  await user.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
  const title = screen.getByRole("textbox", { name: "Task title" });
  call.mockResolvedValueOnce({ isError: true });
  await user.keyboard("Keep this edit{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("The tool could not complete");
  await waitFor(() => expect(title).toHaveFocus());
  expect(title).toHaveValue("Keep this edit");
  let finishWrite!: (value: unknown) => void;
  let finishRead!: (value: unknown) => void;
  call
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
  const form = screen.getByRole("form", { name: `Edit ${task.title}` });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(call).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(title).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh tasks" })).toBeDisabled();
  const updated = { ...task, title: "Keep this edit" };
  await act(async () => finishWrite(result(updated)));
  expect(call).toHaveBeenCalledTimes(3);
  fireEvent.submit(form);
  expect(call).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => finishRead(result([updated])));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: `Edit ${updated.title}` })).toHaveFocus(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("releases the editor when new host data removes its task", async () => {
  const user = userEvent.setup();
  const { session, call } = fixture();
  await user.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
  act(() => {
    session.hostInput({ status: "completed" });
    session.hostResult(result([]));
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh tasks" })).toHaveFocus());
  expect(screen.getByRole("button", { name: "Refresh tasks" })).toBeEnabled();
  expect(screen.queryByRole("textbox", { name: "Task title" })).not.toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("keeps delete visible and keyboard accessible, reports failures, and removes only successful deletions", async () => {
  const user = userEvent.setup();
  const { call } = fixture({ ...tools, deleteTask: "remove_task" });
  const remove = screen.getByRole("button", { name: `Delete ${task.title}` });
  expect(remove).toBeVisible();
  expect(remove).toHaveAttribute("title", "Delete task");
  expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  call.mockResolvedValueOnce({ isError: true });
  remove.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("The tool could not complete");
  expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent(task.title);
  expect(remove).toBeEnabled();

  let finishDeletion!: (value: unknown) => void;
  call
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDeletion = resolve;
        }),
    )
    .mockResolvedValueOnce(result([]));
  await user.keyboard("{Enter}");
  expect(remove).toBeDisabled();
  expect(screen.getByRole("button", { name: `Mark ${task.title} as completed` })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Updating tasks…");
  expect(screen.getByRole("list", { name: "Tasks" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("list", { name: "Tasks" })).toHaveTextContent(task.title);
  await act(async () => finishDeletion(result(task)));
  await screen.findByText("No tasks in this view.");
  expect(screen.queryByRole("button", { name: `Delete ${task.title}` })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("0 tasks in this view");
  expect(call.mock.calls.map(([name]) => name)).toEqual([
    "remove_task",
    "remove_task",
    "listTasks",
  ]);
  expect(call).toHaveBeenNthCalledWith(2, "remove_task", { id: task.id }, expect.any(AbortSignal));
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
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  const hostContext = { theme: "dark" };
  const host: HostApp = {
    request: vi.fn(),
    getHostContext: vi.fn(() => hostContext),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
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
  expect(host.removeEventListener).toHaveBeenCalledWith("hostcontextchanged", expect.any(Function));
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

it("chooses a supported host language before browser preferences and falls back safely", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR", "es-MX"]);
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
  expect(widgetLocale("en-GB")).toBe("en");
  expect(widgetLocale("es-AR")).toBe("es");
  expect(widgetLocale("fr-CA")).toBe("es");
  expect(widgetLocale("invalid locale")).toBe("es");
  expect(widgetLocale()).toBe("es");
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR", "de-DE"]);
  expect(widgetLocale("ja-JP")).toBe("en");
});

it("localizes startup failures before connecting to a host", () => {
  render(
    <WidgetIntlProvider locale="es">
      <WidgetStartupError />
    </WidgetIntlProvider>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "La configuración de la aplicación de tareas no está disponible.",
  );
  expect(document.documentElement).toHaveAttribute("lang", "es");
  expect(document.title).toBe("Tareas de Prelude");
});

it("changes host language without reconnecting, losing drafts, refetching, or resetting filters", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
  type HostContext = { locale?: string; theme?: string };
  type HostApp = {
    ontoolinput?: (event: { arguments: { status: string } }) => void;
    ontoolresult?: (value: unknown) => void;
    request: ReturnType<typeof vi.fn>;
    getHostContext: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  const listeners = new Set<(context: HostContext) => void>();
  const host: HostApp = {
    request: vi.fn(),
    getHostContext: vi.fn(() => ({ locale: "es-MX" })),
    addEventListener: vi.fn((_event, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_event, listener) => listeners.delete(listener)),
  };
  let initialized = false;
  bridge.useApp.mockImplementation((options: { onAppCreated: (app: HostApp) => void }) => {
    if (!initialized) {
      initialized = true;
      options.onAppCreated(host);
    }
    return { app: host, isConnected: true, error: null };
  });
  const connect = vi.spyOn(TaskAppSession.prototype, "connect");
  const dispose = vi.spyOn(TaskAppSession.prototype, "dispose");
  const rendered = render(<TaskApp tools={tools} />);
  act(() => {
    host.ontoolinput?.({ arguments: { status: "active" } });
    host.ontoolresult?.({ structuredContent: { result: [task] } });
  });
  expect(screen.getByRole("heading", { name: "Tus tareas, aquí mismo." })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("1 tarea en esta vista");
  expect(screen.getByRole("button", { name: "Activas" })).toHaveAttribute("aria-pressed", "true");
  await user.type(screen.getByRole("textbox", { name: "Nueva tarea" }), "Keep this create draft");
  await user.click(screen.getByRole("button", { name: `Editar ${task.title}` }));
  const edit = screen.getByRole("textbox", { name: "Título de la tarea" });
  fireEvent.change(edit, { target: { value: "   " } });
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("entre 1 y 120 caracteres");

  // Context notifications contain only changed fields; a theme change retains Spanish.
  act(() => {
    for (const listener of listeners) listener({ theme: "dark" });
  });
  expect(screen.getByRole("heading", { name: "Tus tareas, aquí mismo." })).toBeVisible();
  act(() => {
    for (const listener of listeners) listener({ locale: "en-GB" });
  });
  expect(screen.getByRole("heading", { name: "Your tasks, right here." })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Task title" })).toBe(edit);
  expect(edit).toHaveValue("   ");
  expect(screen.getByRole("textbox", { name: "New task" })).toHaveValue("Keep this create draft");
  expect(screen.getByRole("alert")).toHaveTextContent("between 1 and 120 characters");
  expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("1 task in this view");
  expect(document.documentElement).toHaveAttribute("lang", "en");
  expect(document.title).toBe("Prelude Tasks");
  expect(host.request).not.toHaveBeenCalled();
  expect(connect).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
  expect(host.addEventListener).toHaveBeenCalledOnce();
  rendered.unmount();
  expect(listeners.size).toBe(0);
  expect(dispose).toHaveBeenCalledOnce();
});
