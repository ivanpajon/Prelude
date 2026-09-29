import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readTasks,
  readTools,
  TaskAppSession,
  type TaskAppTools,
  type ToolCaller,
  taskKey,
} from "./model";

const task = { id: "task-1", title: "Build something", completed: false };
const tools = {
  listTasks: "listTasks",
  createTask: "createTask",
  setTaskCompleted: "setTaskCompleted",
  deleteTask: "deleteTask",
};
const result = (value: unknown) => ({ structuredContent: value });
const sessions: TaskAppSession[] = [];

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(config: TaskAppTools = tools) {
  const session = new TaskAppSession(config);
  const call = vi.fn<ToolCaller>();
  session.connect(call);
  session.hostInput({ status: "all" });
  session.hostResult(result([task]));
  sessions.push(session);
  return { session, call };
}

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
});

describe("host payloads", () => {
  it("accepts modern arrays, legacy envelopes, and JSON text fallback", () => {
    for (const payload of [
      result([task]),
      result({ result: [task] }),
      { content: [{ type: "text", text: JSON.stringify([task]) }] },
      { content: [{ type: "text", text: JSON.stringify({ result: [task] }) }] },
    ])
      expect(readTasks(payload)).toEqual([task]);
    expect(readTasks(result([]))).toEqual([]);
  });

  it.each([
    null,
    { isError: true, structuredContent: [task] },
    { content: [{ type: "text", text: "not JSON" }] },
    result({ tasks: [task] }),
    result([task, task]),
    result([{ ...task, id: "" }]),
    result([{ ...task, title: "" }]),
    result([{ ...task, title: "x".repeat(121) }]),
    result([{ ...task, completed: "false" }]),
    { structuredContent: null, content: [{ type: "text", text: JSON.stringify([task]) }] },
  ])(
    "rejects malformed or failed results without falling back from invalid structured content: %j",
    (payload) => {
      expect(() => readTasks(payload)).toThrow();
    },
  );

  it("requires listing but allows excluded mutation tools", () => {
    expect(readTools({ tools: { listTasks: "tasks_list" } })).toEqual({ listTasks: "tasks_list" });
    for (const config of [
      undefined,
      {},
      { tools: {} },
      { tools: { listTasks: " " } },
      { tools: { ...tools, createTask: false } },
      { tools: { ...tools, deleteTask: false } },
      { tools: { ...tools, deleteTask: " " } },
    ]) {
      expect(() => readTools(config)).toThrow();
    }
  });

  it("preserves configured deletion tool names", () => {
    expect(readTools({ tools: { listTasks: "tasks_list", deleteTask: "remove_task" } })).toEqual({
      listTasks: "tasks_list",
      deleteTask: "remove_task",
    });
  });
});

describe("Task App session", () => {
  it("deletes through the configured tool name, invalidates filters, and refreshes the list", async () => {
    const { session, call } = fixture({
      ...tools,
      deleteTask: "remove_task",
      listTasks: "read_tasks",
    });
    session.queryClient.setQueryData(taskKey("active"), [task]);
    call.mockResolvedValueOnce(result(task)).mockResolvedValueOnce(result([]));
    expect(await session.mutate("deleteTask", { id: task.id })).toBe(true);
    expect(call).toHaveBeenNthCalledWith(
      1,
      "remove_task",
      { id: task.id },
      expect.any(AbortSignal),
    );
    expect(call).toHaveBeenNthCalledWith(
      2,
      "read_tasks",
      { status: "all" },
      expect.any(AbortSignal),
    );
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([]);
    expect(session.queryClient.getQueryState(taskKey("active"))?.isInvalidated).toBe(true);
    expect(session.snapshot()).toMatchObject({ mutating: false, loading: false, error: null });
  });

  it("leaves a failed deletion in the list and retries without optimistic removal", async () => {
    const { session, call } = fixture();
    for (const payload of [{ isError: true }, result({ id: task.id })]) {
      call.mockResolvedValueOnce(payload);
      expect(await session.mutate("deleteTask", { id: task.id })).toBe(false);
      expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([task]);
      expect(session.snapshot()).toMatchObject({ mutating: false, error: expect.any(String) });
    }
    expect(call).toHaveBeenCalledTimes(2);
    call.mockResolvedValueOnce(result(task)).mockResolvedValueOnce(result([]));
    expect(await session.mutate("deleteTask", { id: task.id })).toBe(true);
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([]);
  });

  it("guards duplicate deletion, cancels its pending bridge call, and recovers by refreshing", async () => {
    const { session, call } = fixture();
    const pending = deferred();
    call.mockReturnValueOnce(pending.promise);
    const deletion = session.mutate("deleteTask", { id: task.id });
    expect(await session.mutate("deleteTask", { id: task.id })).toBe(false);
    expect(await session.refresh()).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    const signal = call.mock.calls[0]?.[2];
    session.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve(result(task));
    expect(await deletion).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([task]);
    expect(session.snapshot().error).toContain("cancelled");
    // Cancellation does not undo a write already accepted by the server.
    call.mockResolvedValueOnce(result([]));
    expect(await session.refresh()).toBe(true);
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([]);
    expect(session.snapshot().error).toBeNull();
  });

  it("does not dispatch a deletion excluded from the generated catalog", async () => {
    const { session, call } = fixture({ listTasks: "listTasks" });
    expect(await session.mutate("deleteTask", { id: task.id })).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([task]);
  });
  it("seeds one instance from host data without an immediate duplicate fetch", async () => {
    const { session, call } = fixture();
    const other = fixture().session;
    session.hostInput({ status: "completed" });
    session.hostResult(result([{ ...task, completed: true }]));
    await Promise.resolve();
    expect(call).not.toHaveBeenCalled();
    expect(session.snapshot()).toMatchObject({
      status: "completed",
      loading: false,
      connected: true,
      error: null,
    });
    expect(session.queryClient.getQueryData(taskKey("completed"))).toEqual([
      { ...task, completed: true },
    ]);
    expect(other.queryClient.getQueryData(taskKey("completed"))).toBeUndefined();
    expect(other.snapshot().status).toBe("all");
  });

  it("changes filters through the host and ignores a late unsolicited host result", async () => {
    const { session, call } = fixture();
    call.mockResolvedValue(result([]));
    expect(await session.refresh("completed")).toBe(true);
    expect(call).toHaveBeenCalledWith(
      "listTasks",
      { status: "completed" },
      expect.any(AbortSignal),
    );
    session.hostResult(result([task]));
    expect(session.queryClient.getQueryData(taskKey("completed"))).toEqual([]);
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([task]);
    expect(session.snapshot()).toMatchObject({ status: "completed", loading: false, error: null });
  });

  it("invalidates other cached filters and refreshes the visible list after a normalized mutation", async () => {
    const { session, call } = fixture();
    session.queryClient.setQueryData(taskKey("completed"), []);
    const created = { ...task, id: "task-2", title: "New idea" };
    call.mockResolvedValueOnce(result(created)).mockResolvedValueOnce(result([task, created]));
    expect(await session.mutate("createTask", { title: "New idea" })).toBe(true);
    expect(call.mock.calls.map(([name]) => name)).toEqual(["createTask", "listTasks"]);
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([task, created]);
    expect(session.queryClient.getQueryState(taskKey("completed"))?.isInvalidated).toBe(true);
    expect(session.snapshot()).toMatchObject({ loading: false, mutating: false, error: null });
  });

  it("guards synchronous duplicate writes and blocks refresh while a write is pending", async () => {
    const { session, call } = fixture();
    const pending = deferred();
    call
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(result([{ ...task, completed: true }]));
    const write = session.mutate("setTaskCompleted", { id: task.id, completed: true });
    expect(session.snapshot().mutating).toBe(true);
    expect(await session.mutate("setTaskCompleted", { id: task.id, completed: true })).toBe(false);
    expect(await session.refresh("active")).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    pending.resolve(result({ ...task, completed: true }));
    expect(await write).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("preserves a successful write when the following read fails and permits read-only retry", async () => {
    const { session, call } = fixture();
    call.mockResolvedValueOnce(result(task)).mockRejectedValueOnce(new Error("Connection lost"));
    expect(await session.mutate("createTask", { title: task.title })).toBe(true);
    expect(session.snapshot()).toMatchObject({
      error: "Connection lost",
      mutating: false,
      loading: false,
    });
    call.mockResolvedValueOnce(result([task]));
    expect(await session.refresh()).toBe(true);
    expect(call.mock.calls.map(([name]) => name)).toEqual(["createTask", "listTasks", "listTasks"]);
    expect(session.snapshot().error).toBeNull();
  });

  it("surfaces failed and malformed writes without issuing a follow-up read", async () => {
    const { session, call } = fixture();
    for (const payload of [{ isError: true }, result({ id: "bad" })]) {
      call.mockResolvedValueOnce(payload);
      expect(await session.mutate("createTask", { title: "Try this" })).toBe(false);
      expect(session.snapshot()).toMatchObject({
        mutating: false,
        loading: false,
        error: expect.any(String),
      });
    }
    expect(call.mock.calls.map(([name]) => name)).toEqual(["createTask", "createTask"]);
    expect(session.queryClient.getQueryData(taskKey("all"))).toEqual([task]);
  });

  it("cancels obsolete filter requests and prevents their late results from replacing the current list", async () => {
    const { session, call } = fixture();
    const old = deferred();
    call
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(result([{ ...task, completed: true }]));
    const first = session.refresh("active");
    const signal = call.mock.calls[0]?.[2];
    const second = session.refresh("completed");
    expect(signal?.aborted).toBe(true);
    expect(await second).toBe(true);
    old.resolve(result([task]));
    expect(await first).toBe(false);
    expect(session.snapshot()).toMatchObject({ status: "completed", loading: false, error: null });
    expect(session.queryClient.getQueryData(taskKey("active"))).toBeUndefined();
    expect(session.queryClient.getQueryData(taskKey("completed"))).toEqual([
      { ...task, completed: true },
    ]);
  });

  it("aborts writes when new host input arrives and ignores their late completion", async () => {
    const { session, call } = fixture();
    const pending = deferred();
    call.mockReturnValueOnce(pending.promise);
    const write = session.mutate("createTask", { title: "Obsolete" });
    const signal = call.mock.calls[0]?.[2];
    session.hostInput({ status: "completed" });
    session.hostResult(result([]));
    expect(signal?.aborted).toBe(true);
    pending.resolve(result(task));
    expect(await write).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(session.snapshot()).toMatchObject({
      status: "completed",
      loading: false,
      mutating: false,
      error: null,
    });
    expect(session.queryClient.getQueryData(taskKey("completed"))).toEqual([]);
  });

  it("announces cancellation, rejects late host results, and recovers on refresh", async () => {
    const { session, call } = fixture();
    session.hostInput({ status: "active" });
    session.cancel();
    session.hostResult(result([task]));
    expect(session.queryClient.getQueryData(taskKey("active"))).toBeUndefined();
    expect(session.snapshot()).toMatchObject({
      loading: false,
      error: expect.stringContaining("cancelled"),
    });
    call.mockResolvedValueOnce(result([task]));
    expect(await session.refresh()).toBe(true);
    expect(session.snapshot().error).toBeNull();
  });

  it("rejects invalid host input and malformed initial data visibly", () => {
    const { session } = fixture();
    session.hostInput({ status: "invalid" });
    session.hostResult(result([]));
    expect(session.snapshot().error).toContain("valid status");
    session.hostInput({ status: "all" });
    session.hostResult(result({ unexpected: true }));
    expect(session.snapshot()).toMatchObject({
      loading: false,
      error: expect.stringContaining("invalid task list"),
    });
  });

  it("cleans up pending work, cache, and subscriptions without allowing later activity", async () => {
    const { session, call } = fixture();
    const pending = deferred();
    call.mockReturnValueOnce(pending.promise);
    const notify = vi.fn();
    session.subscribe(notify);
    const refresh = session.refresh();
    const signal = call.mock.calls[0]?.[2];
    session.dispose();
    const notifications = notify.mock.calls.length;
    expect(signal?.aborted).toBe(true);
    pending.resolve(result([]));
    expect(await refresh).toBe(false);
    session.hostResult(result([task]));
    expect(await session.refresh()).toBe(false);
    expect(await session.mutate("createTask", { title: "No" })).toBe(false);
    expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(notifications);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
