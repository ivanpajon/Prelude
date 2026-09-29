import { useApp, useAutoResize, useHostStyleVariables } from "@modelcontextprotocol/ext-apps/react";
import type { Task, TaskStatus } from "@repo/contracts";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { CheckIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { callHostTool } from "./bridge";
import { TaskAppSession, type TaskAppTools, taskKey } from "./model";

const filters: [TaskStatus, string][] = [
  ["all", "All tasks"],
  ["active", "Active"],
  ["completed", "Completed"],
];

function TaskTitleEditor({
  task,
  session,
  disabled,
  onClose,
}: {
  task: Task;
  session: TaskAppSession;
  disabled: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const restoreInputFocus = useRef(false);
  const mounted = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  useEffect(() => {
    mounted.current = true;
    input.current?.focus();
    input.current?.select();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!saving && restoreInputFocus.current) {
      input.current?.focus();
      restoreInputFocus.current = false;
    }
  }, [saving]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || disabled) return;
    const normalized = title.trim();
    if (!normalized || normalized.length > 120) {
      setError("Enter a task between 1 and 120 characters.");
      input.current?.focus();
      return;
    }
    setError(null);
    pending.current = true;
    setSaving(true);
    const saved = await session.mutate("updateTaskTitle", { id: task.id, title: normalized });
    pending.current = false;
    if (!mounted.current) return;
    restoreInputFocus.current = !saved;
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <form
      className="flex min-w-0 flex-1 flex-wrap items-start gap-2"
      aria-label={`Edit ${task.title}`}
      onSubmit={submit}
    >
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <label className="sr-only" htmlFor={fieldId}>
          Task title
        </label>
        <Input
          ref={input}
          id={fieldId}
          value={title}
          disabled={disabled || saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending.current && !disabled) {
              event.preventDefault();
              onClose();
            }
          }}
        />
        {error && (
          <p id={`${fieldId}-error`} className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={disabled || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="outline" disabled={disabled || saving} onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
}

export function TaskAppView({ session }: { session: TaskAppSession }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const tasks = useQuery<Task[]>({
    queryKey: taskKey(state.status),
    queryFn: async () => [],
    enabled: false,
  });
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const focusAfterEdit = useRef<string | null>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const refreshButton = useRef<HTMLButtonElement>(null);
  const busy = !state.connected || state.mutating;
  const editing = editingId !== null;

  useEffect(() => {
    if (editingId !== null || focusAfterEdit.current === null) return;
    (editButtons.current.get(focusAfterEdit.current) ?? refreshButton.current)?.focus();
    focusAfterEdit.current = null;
  }, [editingId]);

  function closeEditor(id: string) {
    focusAfterEdit.current = id;
    setEditingId(null);
  }

  useEffect(() => {
    if (
      editingId !== null &&
      !state.loading &&
      !state.mutating &&
      !tasks.data?.some((task) => task.id === editingId)
    ) {
      focusAfterEdit.current = editingId;
      setEditingId(null);
    }
  }, [editingId, state.loading, state.mutating, tasks.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) return;
    const normalized = title.trim();
    if (!normalized || normalized.length > 120) {
      session.fail("Enter a task between 1 and 120 characters.");
      return;
    }
    if (await session.mutate("createTask", { title: normalized })) {
      setTitle((current) => (current === title ? "" : current));
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6" aria-label="Prelude task app">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">
            Prelude · MCP App
          </p>
          <h1 className="mt-1 text-xl font-semibold">Your tasks, right here.</h1>
        </div>
        <Button
          ref={refreshButton}
          variant="outline"
          disabled={busy || state.loading || editing}
          onClick={() => void session.refresh()}
          aria-label="Refresh tasks"
        >
          <RefreshCwIcon aria-hidden="true" />
          Refresh
        </Button>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">
        The same shared list, through your MCP connection.
      </p>
      {session.tools.createTask && (
        <form className="mt-5 flex flex-wrap gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor="task-title">
            New task
          </label>
          <Input
            id="task-title"
            className="min-w-0 flex-1"
            placeholder="What will you build next?"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || editing}>
            <PlusIcon aria-hidden="true" />
            Add task
          </Button>
        </form>
      )}
      <nav className="mt-5 flex flex-wrap gap-1" aria-label="Task filters">
        {filters.map(([status, label]) => (
          <Button
            key={status}
            variant={status === state.status ? "secondary" : "ghost"}
            aria-pressed={status === state.status}
            disabled={busy || editing}
            onClick={() => void session.refresh(status)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div className="mt-3 text-sm" aria-live="polite" role="status">
        {state.mutating
          ? "Updating tasks…"
          : state.loading
            ? "Loading tasks…"
            : `${tasks.data?.length ?? 0} tasks in this view`}
      </div>
      {state.error && (
        <div
          className="mt-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          role="alert"
        >
          {state.error}
        </div>
      )}
      <ul
        className="mt-3 divide-y border-y"
        aria-label="Tasks"
        aria-busy={state.loading || state.mutating}
      >
        {tasks.data?.map((task) => (
          <li key={task.id} className="flex items-center gap-3 py-3">
            {session.tools.setTaskCompleted ? (
              <Button
                size="icon"
                variant={task.completed ? "default" : "outline"}
                disabled={busy || editing}
                aria-label={`Mark ${task.title} as ${task.completed ? "active" : "completed"}`}
                aria-pressed={task.completed}
                onClick={() =>
                  void session.mutate("setTaskCompleted", {
                    id: task.id,
                    completed: !task.completed,
                  })
                }
              >
                {task.completed && <CheckIcon aria-hidden="true" />}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {task.completed ? "Done" : "Active"}
              </span>
            )}
            {editingId === task.id ? (
              <TaskTitleEditor
                task={task}
                session={session}
                disabled={busy}
                onClose={() => closeEditor(task.id)}
              />
            ) : (
              <span
                className={
                  task.completed
                    ? "min-w-0 flex-1 text-sm wrap-anywhere text-muted-foreground line-through"
                    : "min-w-0 flex-1 text-sm wrap-anywhere"
                }
              >
                {task.title}
              </span>
            )}
            {session.tools.updateTaskTitle && editingId !== task.id && (
              <Button
                ref={(element) => {
                  if (element) editButtons.current.set(task.id, element);
                  else editButtons.current.delete(task.id);
                }}
                size="icon"
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy || editing}
                aria-label={`Edit ${task.title}`}
                title="Edit task"
                onClick={() => {
                  session.clearError();
                  setEditingId(task.id);
                }}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
            )}
            {session.tools.deleteTask && editingId !== task.id && (
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || editing}
                aria-label={`Delete ${task.title}`}
                title="Delete task"
                onClick={() => void session.mutate("deleteTask", { id: task.id })}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!state.loading && !state.error && !tasks.data?.length && (
        <p className="py-5 text-sm text-muted-foreground">No tasks in this view.</p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Public demo data resets when the server restarts. Refresh other clients to see changes.
      </p>
    </main>
  );
}

export function TaskApp({ tools }: { tools: TaskAppTools }) {
  const [session] = useState(() => new TaskAppSession(tools));
  const { app, isConnected, error } = useApp({
    appInfo: { name: "Prelude Tasks", version: "1.0.0" },
    capabilities: {},
    autoResize: false,
    strict: true,
    onAppCreated(app) {
      app.ontoolinput = ({ arguments: args }) => session.hostInput(args);
      app.ontoolresult = (result) => session.hostResult(result);
      app.ontoolcancelled = () => session.cancel();
      app.onerror = () => session.fail("The MCP connection failed. Refresh to try again.");
    },
  });
  useHostStyleVariables(app, app?.getHostContext());
  useAutoResize(app);
  useEffect(() => {
    if (app && isConnected)
      session.connect((name, args, signal) => callHostTool(app, name, args, signal));
  }, [app, isConnected, session]);
  useEffect(() => {
    if (error) session.fail("Unable to connect to the MCP host.");
  }, [error, session]);
  useEffect(() => () => session.dispose(), [session]);
  return (
    <QueryClientProvider client={session.queryClient}>
      <TaskAppView session={session} />
    </QueryClientProvider>
  );
}
