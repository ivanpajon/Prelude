import type { Task, TaskStatus } from "@repo/contracts";
import { QueryClient } from "@tanstack/react-query";

export type TaskAppErrorCode =
  | "errorConfigurationMissing"
  | "errorListingUnavailable"
  | "errorConfigurationInvalid"
  | "errorInvalidToolResult"
  | "errorToolFailed"
  | "errorInvalidTaskList"
  | "errorInvalidStatus"
  | "errorReadFailed"
  | "errorCancelled"
  | "errorLoadFailed"
  | "errorInvalidTask"
  | "errorUpdateFailed"
  | "errorConnectionFailed"
  | "errorHostUnavailable"
  | "errorInvalidTitle";

export interface TaskAppIssue {
  code: TaskAppErrorCode;
  values?: Record<string, string | number>;
}

/** Keep presentation out of the session so an existing error can change language. */
export class TaskAppError extends Error {
  constructor(readonly issue: TaskAppIssue) {
    super(issue.code);
    this.name = "TaskAppError";
  }
}

function readIssue(error: unknown, fallback: TaskAppErrorCode): TaskAppIssue {
  return error instanceof TaskAppError ? error.issue : { code: fallback };
}

export interface TaskAppTools {
  listTasks: string;
  createTask?: string;
  setTaskCompleted?: string;
  updateTaskTitle?: string;
  deleteTask?: string;
}

export type ToolCaller = (
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readTools(value: unknown): TaskAppTools {
  if (!record(value) || !record(value.tools))
    throw new TaskAppError({ code: "errorConfigurationMissing" });
  const tools = value.tools;
  if (typeof tools.listTasks !== "string" || !tools.listTasks.trim()) {
    throw new TaskAppError({ code: "errorListingUnavailable" });
  }
  for (const name of ["createTask", "setTaskCompleted", "updateTaskTitle", "deleteTask"]) {
    if (tools[name] !== undefined && (typeof tools[name] !== "string" || !tools[name].trim())) {
      throw new TaskAppError({ code: "errorConfigurationInvalid" });
    }
  }
  return tools as unknown as TaskAppTools;
}

function resultValue(result: unknown): unknown {
  if (!record(result)) throw new TaskAppError({ code: "errorInvalidToolResult" });
  if (result.isError) throw new TaskAppError({ code: "errorToolFailed" });
  let value = result.structuredContent;
  if (value === undefined && Array.isArray(result.content)) {
    const block = result.content.find((item) => record(item) && item.type === "text");
    if (record(block) && typeof block.text === "string") {
      try {
        value = JSON.parse(block.text);
      } catch {
        /* Shape validation below reports the error. */
      }
    }
  }
  return record(value) && "result" in value ? value.result : value;
}

function isTask(value: unknown): value is Task {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    value.title.length <= 120 &&
    typeof value.completed === "boolean"
  );
}

export function readTasks(result: unknown): Task[] {
  const value = resultValue(result);
  if (
    !Array.isArray(value) ||
    !value.every(isTask) ||
    new Set(value.map((task) => task.id)).size !== value.length
  ) {
    throw new TaskAppError({ code: "errorInvalidTaskList" });
  }
  return value;
}

export const taskKey = (status: TaskStatus) => ["mcp-app-tasks", status] as const;

interface AppState {
  status: TaskStatus;
  connected: boolean;
  loading: boolean;
  mutating: boolean;
  error: TaskAppIssue | null;
}

// The host owns transport. This instance owns only this widget's query cache and lifecycle.
export class TaskAppSession {
  readonly queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  private state: AppState = {
    status: "all",
    connected: false,
    loading: true,
    mutating: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private caller: ToolCaller | undefined;
  private generation = 0;
  private mutation: AbortController | undefined;
  private expectingHost = true;
  private disposed = false;

  constructor(readonly tools: TaskAppTools) {}

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<AppState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  connect(caller: ToolCaller) {
    this.caller = caller;
    this.update({ connected: true });
  }
  private cancelRequests() {
    this.generation++;
    this.mutation?.abort();
    this.mutation = undefined;
    void this.queryClient.cancelQueries();
  }
  hostInput(args?: Record<string, unknown>) {
    this.cancelRequests();
    this.expectingHost = true;
    const status = args?.status;
    if (status !== "all" && status !== "active" && status !== "completed") {
      this.fail({ code: "errorInvalidStatus" });
      this.expectingHost = false;
      return;
    }
    this.update({ status, loading: true, mutating: false, error: null });
  }
  hostResult(result: unknown) {
    if (this.disposed || !this.expectingHost) return;
    this.expectingHost = false;
    try {
      this.queryClient.setQueryData(taskKey(this.state.status), readTasks(result));
      this.update({ loading: false, error: null });
    } catch (error) {
      this.fail(readIssue(error, "errorReadFailed"));
    }
  }
  fail(issue: TaskAppIssue) {
    this.cancelRequests();
    this.expectingHost = false;
    this.update({ loading: false, mutating: false, error: issue });
  }
  cancel() {
    this.fail({ code: "errorCancelled" });
  }
  clearError() {
    this.update({ error: null });
  }

  async refresh(status = this.state.status): Promise<boolean> {
    if (this.disposed || !this.caller || this.state.mutating) return false;
    this.cancelRequests();
    this.expectingHost = false;
    const generation = this.generation;
    const call = this.caller;
    this.update({ status, loading: true, error: null });
    try {
      await this.queryClient.fetchQuery({
        queryKey: taskKey(status),
        staleTime: 0,
        queryFn: async ({ signal }) =>
          readTasks(await call(this.tools.listTasks, { status }, signal)),
      });
      if (generation !== this.generation || this.disposed) return false;
      this.update({ loading: false });
      return true;
    } catch (error) {
      if (generation === this.generation)
        this.update({
          loading: false,
          error: readIssue(error, "errorLoadFailed"),
        });
      return false;
    }
  }

  async mutate(
    operation: "createTask" | "setTaskCompleted" | "updateTaskTitle" | "deleteTask",
    args: Record<string, unknown>,
  ): Promise<boolean> {
    const name = this.tools[operation];
    if (!name || !this.caller || this.disposed || this.state.mutating) return false;
    this.cancelRequests();
    this.expectingHost = false;
    const generation = this.generation;
    const controller = new AbortController();
    this.mutation = controller;
    this.update({ mutating: true, loading: false, error: null });
    try {
      const result = resultValue(await this.caller(name, args, controller.signal));
      if (generation !== this.generation || this.disposed) return false;
      if (!isTask(result)) throw new TaskAppError({ code: "errorInvalidTask" });
      await this.queryClient.invalidateQueries({
        queryKey: ["mcp-app-tasks"],
        refetchType: "none",
      });
      this.mutation = undefined;
      this.update({ mutating: false });
      // The write succeeded even if the following read fails; retain the read error for retry.
      await this.refresh();
      return true;
    } catch (error) {
      if (generation === this.generation)
        this.update({
          mutating: false,
          error: readIssue(error, "errorUpdateFailed"),
        });
      return false;
    }
  }

  dispose() {
    this.disposed = true;
    this.cancelRequests();
    this.queryClient.clear();
    this.listeners.clear();
    this.caller = undefined;
  }
}
