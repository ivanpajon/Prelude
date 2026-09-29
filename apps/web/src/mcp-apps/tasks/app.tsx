import { useApp, useAutoResize, useHostStyleVariables } from "@modelcontextprotocol/ext-apps/react";
import type { Task, TaskStatus } from "@repo/contracts";
import { type Locale, resolveLocale } from "@repo/i18n";
import { getWidgetMessages } from "@repo/i18n/widget";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { CheckIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { IntlProvider, useLocale, useTranslations } from "use-intl";
import { callHostTool } from "./bridge";
import { type TaskAppIssue, TaskAppSession, type TaskAppTools, taskKey } from "./model";

const filters: [TaskStatus, "filterAll" | "filterActive" | "filterCompleted"][] = [
  ["all", "filterAll"],
  ["active", "filterActive"],
  ["completed", "filterCompleted"],
];

export function widgetLocale(hostLocale?: string): Locale {
  return resolveLocale(hostLocale, ...navigator.languages, navigator.language);
}

function WidgetDocument() {
  const locale = useLocale();
  const t = useTranslations("Widget");
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("documentTitle");
  }, [locale, t]);
  return null;
}

export function WidgetIntlProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <IntlProvider locale={locale} messages={getWidgetMessages(locale)} timeZone="UTC">
      <WidgetDocument />
      {children}
    </IntlProvider>
  );
}

export function WidgetStartupError() {
  const t = useTranslations("Widget");
  return <p role="alert">{t("errorStartupFailed")}</p>;
}

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
  const t = useTranslations("Widget");
  const [title, setTitle] = useState(task.title);
  const [error, setError] = useState<TaskAppIssue | null>(null);
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
      setError({ code: "errorInvalidTitle", values: { min: 1, max: 120 } });
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
      aria-label={t("editLabel", { title: task.title })}
      onSubmit={submit}
    >
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <label className="sr-only" htmlFor={fieldId}>
          {t("taskTitleLabel")}
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
            {t(error.code, error.values)}
          </p>
        )}
      </div>
      <Button type="submit" disabled={disabled || saving}>
        {t(saving ? "saving" : "save")}
      </Button>
      <Button type="button" variant="outline" disabled={disabled || saving} onClick={onClose}>
        {t("cancel")}
      </Button>
    </form>
  );
}

export function TaskAppView({ session }: { session: TaskAppSession }) {
  const t = useTranslations("Widget");
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
      session.fail({ code: "errorInvalidTitle", values: { min: 1, max: 120 } });
      return;
    }
    if (await session.mutate("createTask", { title: normalized })) {
      setTitle((current) => (current === title ? "" : current));
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6" aria-label={t("appLabel")}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">{t("eyebrow")}</p>
          <h1 className="mt-1 text-xl font-semibold">{t("heading")}</h1>
        </div>
        <Button
          ref={refreshButton}
          variant="outline"
          disabled={busy || state.loading || editing}
          onClick={() => void session.refresh()}
          aria-label={t("refreshLabel")}
        >
          <RefreshCwIcon aria-hidden="true" />
          {t("refresh")}
        </Button>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
      {session.tools.createTask && (
        <form className="mt-5 flex flex-wrap gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor="task-title">
            {t("newTaskLabel")}
          </label>
          <Input
            id="task-title"
            className="min-w-0 flex-1"
            placeholder={t("newTaskPlaceholder")}
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || editing}>
            <PlusIcon aria-hidden="true" />
            {t("addTask")}
          </Button>
        </form>
      )}
      <nav className="mt-5 flex flex-wrap gap-1" aria-label={t("filtersLabel")}>
        {filters.map(([status, label]) => (
          <Button
            key={status}
            variant={status === state.status ? "secondary" : "ghost"}
            aria-pressed={status === state.status}
            disabled={busy || editing}
            onClick={() => void session.refresh(status)}
          >
            {t(label)}
          </Button>
        ))}
      </nav>
      <div className="mt-3 text-sm" aria-live="polite" role="status">
        {state.mutating
          ? t("updating")
          : state.loading
            ? t("loading")
            : t("taskCount", { count: tasks.data?.length ?? 0 })}
      </div>
      {state.error && (
        <div
          className="mt-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          role="alert"
        >
          {t(state.error.code, state.error.values)}
        </div>
      )}
      <ul
        className="mt-3 divide-y border-y"
        aria-label={t("tasksLabel")}
        aria-busy={state.loading || state.mutating}
      >
        {tasks.data?.map((task) => (
          <li key={task.id} className="flex items-center gap-3 py-3">
            {session.tools.setTaskCompleted ? (
              <Button
                size="icon"
                variant={task.completed ? "default" : "outline"}
                disabled={busy || editing}
                aria-label={t(task.completed ? "markActive" : "markCompleted", {
                  title: task.title,
                })}
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
                {t(task.completed ? "completedStatus" : "activeStatus")}
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
                aria-label={t("editLabel", { title: task.title })}
                title={t("editTitle")}
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
                aria-label={t("deleteLabel", { title: task.title })}
                title={t("deleteTitle")}
                onClick={() => void session.mutate("deleteTask", { id: task.id })}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!state.loading && !state.error && !tasks.data?.length && (
        <p className="py-5 text-sm text-muted-foreground">{t("empty")}</p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t("demoNote")}</p>
    </main>
  );
}

export function TaskApp({ tools }: { tools: TaskAppTools }) {
  const [session] = useState(() => new TaskAppSession(tools));
  const [hostLocale, setHostLocale] = useState<string | undefined>();
  const { app, isConnected, error } = useApp({
    appInfo: { name: "Prelude Tasks", version: "1.0.0" },
    capabilities: {},
    autoResize: false,
    strict: true,
    onAppCreated(app) {
      app.ontoolinput = ({ arguments: args }) => session.hostInput(args);
      app.ontoolresult = (result) => session.hostResult(result);
      app.ontoolcancelled = () => session.cancel();
      app.onerror = () => session.fail({ code: "errorConnectionFailed" });
    },
  });
  useHostStyleVariables(app, app?.getHostContext());
  useAutoResize(app);
  useEffect(() => {
    if (!app || !isConnected) return;
    const changed = (context: { locale?: string }) => {
      // Notifications are partial: a theme change must not reset the host's language.
      if ("locale" in context) setHostLocale(context.locale);
    };
    app.addEventListener("hostcontextchanged", changed);
    setHostLocale(app.getHostContext()?.locale);
    return () => app.removeEventListener("hostcontextchanged", changed);
  }, [app, isConnected]);
  useEffect(() => {
    if (app && isConnected)
      session.connect((name, args, signal) => callHostTool(app, name, args, signal));
  }, [app, isConnected, session]);
  useEffect(() => {
    if (error) session.fail({ code: "errorHostUnavailable" });
  }, [error, session]);
  useEffect(() => () => session.dispose(), [session]);
  return (
    <WidgetIntlProvider locale={widgetLocale(hostLocale)}>
      <QueryClientProvider client={session.queryClient}>
        <TaskAppView session={session} />
      </QueryClientProvider>
    </WidgetIntlProvider>
  );
}
