"use client";

import { createTaskInput, taskStatuses, updateTaskTitleInput } from "@repo/contracts";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { MorphIcon } from "@repo/ui/components/morph-icon";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type } from "arktype";
import { LayoutList, List } from "lucide";
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import * as m from "motion/react-m";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { orpc } from "@/lib/orpc";
import { taskSearchParsers } from "@/lib/task-search";
import { useWorkbenchStore } from "./workbench-store-provider";

type TaskErrorCode =
  | "invalidTitle"
  | "taskNotFound"
  | "createFailed"
  | "completionFailed"
  | "deleteFailed"
  | "editFailed";

function taskError(error: unknown, fallback: TaskErrorCode): TaskErrorCode | undefined {
  if (!error) return undefined;
  return typeof error === "object" && "code" in error && error.code === "NOT_FOUND"
    ? "taskNotFound"
    : fallback;
}

function TaskTitleEditor({
  title,
  pending,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  pending: boolean;
  error: string | undefined;
  onChange: (title: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Tasks");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  useEffect(() => {
    if (!pending) input.current?.focus();
  }, [pending]);

  return (
    <form className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={onSubmit}>
      <label htmlFor="task-edit-title" className="sr-only">
        {t("taskTitle")}
      </label>
      <Input
        ref={input}
        id="task-edit-title"
        aria-label={t("taskTitle")}
        value={title}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) {
            event.preventDefault();
            onCancel();
          }
        }}
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "task-edit-feedback" : undefined}
        className="min-w-0 basis-full sm:flex-1 sm:basis-0"
      />
      <Button type="submit" disabled={pending}>
        {t(pending ? "saving" : "save")}
      </Button>
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
        {t("cancel")}
      </Button>
      {error && (
        <p id="task-edit-feedback" role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function TaskWorkbench() {
  const t = useTranslations("Tasks");
  const [status, setStatus] = useQueryState(
    "status",
    taskSearchParsers.status.withOptions({ history: "push" }),
  );
  const [title, setTitle] = useState("");
  const [validationError, setValidationError] = useState<TaskErrorCode>();
  const [editing, setEditing] = useState<{ id: string; title: string }>();
  const [editError, setEditError] = useState<TaskErrorCode>();
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const newTaskInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const changingTask = useRef(false);
  const compact = useWorkbenchStore((state) => state.compact);
  const toggleCompact = useWorkbenchStore((state) => state.toggleCompact);
  const queryClient = useQueryClient();
  const tasks = useQuery(orpc.tasks.list.queryOptions({ input: { status } }));
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
  const createTask = useMutation(orpc.tasks.create.mutationOptions({ onSuccess: invalidateTasks }));
  const setCompleted = useMutation(
    orpc.tasks.setCompleted.mutationOptions({ onSuccess: invalidateTasks }),
  );
  const deleteTask = useMutation(orpc.tasks.delete.mutationOptions({ onSuccess: invalidateTasks }));
  const updateTitle = useMutation(
    orpc.tasks.updateTitle.mutationOptions({ onSuccess: invalidateTasks }),
  );
  const taskChangePending = setCompleted.isPending || deleteTask.isPending || updateTitle.isPending;

  useEffect(() => {
    if (!editing && editTrigger.current) {
      if (editTrigger.current.isConnected) editTrigger.current.focus();
      else newTaskInput.current?.focus();
      editTrigger.current = null;
    }
  }, [editing]);

  useEffect(() => {
    // A refetch or browser history navigation can remove the row being edited.
    if (
      editing &&
      tasks.isSuccess &&
      !tasks.isFetching &&
      !taskChangePending &&
      !tasks.data.some((task) => task.id === editing.id)
    ) {
      setEditing(undefined);
      setEditError(undefined);
    }
  }, [editing, taskChangePending, tasks.data, tasks.isFetching, tasks.isSuccess]);

  async function changeTask(action: () => Promise<unknown>) {
    if (changingTask.current) return false;
    changingTask.current = true;
    setValidationError(undefined);
    if (!createTask.isPending) createTask.reset();
    setCompleted.reset();
    deleteTask.reset();
    updateTitle.reset();
    try {
      await action();
      return true;
    } catch {
      // Keep the task visible and expose the mutation error so the action can be retried.
      return false;
    } finally {
      changingTask.current = false;
    }
  }

  function cancelEdit() {
    if (changingTask.current) return;
    setEditing(undefined);
    setEditError(undefined);
    updateTitle.reset();
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || changingTask.current) return;
    setEditError(undefined);
    updateTitle.reset();
    const input = updateTaskTitleInput(editing);
    if (input instanceof type.errors) {
      setEditError("invalidTitle");
      return;
    }
    if (await changeTask(() => updateTitle.mutateAsync(input))) setEditing(undefined);
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || editing) return;
    setValidationError(undefined);
    createTask.reset();
    if (!changingTask.current) {
      setCompleted.reset();
      deleteTask.reset();
    }
    const input = createTaskInput({ title: title.trim() });
    if (input instanceof type.errors) {
      setValidationError("invalidTitle");
      return;
    }
    submitting.current = true;
    try {
      await createTask.mutateAsync(input);
      setTitle("");
    } catch {
      // Mutation state renders the error and retains the draft for retry.
    } finally {
      submitting.current = false;
    }
  }

  const error =
    validationError ??
    taskError(createTask.error, "createFailed") ??
    taskError(setCompleted.error, "completionFailed") ??
    taskError(deleteTask.error, "deleteFailed");
  const editingError = editError ?? taskError(updateTitle.error, "editFailed");

  return (
    <Card className="overflow-hidden bg-card shadow-none">
      <CardContent className={compact ? "p-4" : "p-6 sm:p-8"}>
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-4",
            compact ? "mb-3" : "mb-6",
          )}
        >
          <div>
            <h3 className="text-lg font-medium">{t("title")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <Badge variant="secondary">{t("liveDemo")}</Badge>
        </div>
        <form onSubmit={submitTask} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="task-title" className="sr-only">
            {t("newTask")}
          </label>
          <Input
            ref={newTaskInput}
            id="task-title"
            aria-label={t("newTask")}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
            placeholder={t("newTaskPlaceholder")}
            aria-describedby="task-feedback"
            className="flex-1"
          />
          <Button type="submit" disabled={createTask.isPending || Boolean(editing)}>
            <PlusIcon aria-hidden="true" />
            {t(createTask.isPending ? "adding" : "addTask")}
          </Button>
        </form>
        <div
          id="task-feedback"
          aria-live="polite"
          className="mt-2 min-h-5 text-sm text-destructive"
        >
          {error && t(error)}
        </div>
        <span role="status" className="sr-only">
          {updateTitle.isPending
            ? t("savingTask")
            : updateTitle.isSuccess
              ? t("savedTask", { title: updateTitle.data.title })
              : deleteTask.isPending
                ? t("deletingTask")
                : deleteTask.isSuccess
                  ? t("deletedTask", { title: deleteTask.data.title })
                  : ""}
        </span>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">{t("filterTasks")}</legend>
            {taskStatuses.map((filter) => (
              <Button
                key={filter}
                variant={filter === status ? "secondary" : "ghost"}
                aria-pressed={filter === status}
                disabled={Boolean(editing)}
                onClick={() => void setStatus(filter)}
              >
                {t(filter)}
              </Button>
            ))}
          </fieldset>
          <Button variant="ghost" onClick={toggleCompact} aria-pressed={compact}>
            <MorphIcon icon={compact ? List : LayoutList} />
            {t("compactView")}
          </Button>
        </div>
        {tasks.isError && (
          <div role="alert" className="flex items-center justify-between gap-4 py-8">
            <p className="text-sm text-destructive">
              {t(tasks.data ? "refreshFailed" : "loadFailed")}
            </p>
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              {t("tryAgain")}
            </Button>
          </div>
        )}
        {tasks.isPending ? (
          <p role="status" className="py-8 text-sm text-muted-foreground">
            {t("loading")}
          </p>
        ) : !tasks.data ? null : tasks.data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul aria-label={t("listLabel")} className="divide-y">
            {tasks.data.map((task) => (
              <m.li
                key={task.id}
                layout="position"
                initial={false}
                className={cn("flex items-center", compact ? "gap-2 py-1" : "gap-4 py-6")}
              >
                <Button
                  size={compact ? "icon-xs" : "icon-sm"}
                  variant={task.completed ? "default" : "outline"}
                  aria-label={t(task.completed ? "markActive" : "markCompleted", {
                    title: task.title,
                  })}
                  aria-pressed={task.completed}
                  disabled={taskChangePending || Boolean(editing)}
                  onClick={() =>
                    void changeTask(() =>
                      setCompleted.mutateAsync({ id: task.id, completed: !task.completed }),
                    )
                  }
                >
                  {task.completed && <CheckIcon aria-hidden="true" />}
                </Button>
                {editing?.id === task.id ? (
                  <TaskTitleEditor
                    title={editing.title}
                    pending={updateTitle.isPending}
                    error={editingError && t(editingError)}
                    onChange={(title) => setEditing({ id: task.id, title })}
                    onSubmit={(event) => void saveEdit(event)}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <span
                    className={cn(
                      "min-w-0 flex-1 wrap-anywhere",
                      compact ? "text-xs" : "text-base",
                      task.completed && "text-muted-foreground line-through",
                    )}
                  >
                    {task.title}
                  </span>
                )}
                <Button
                  size={compact ? "icon-xs" : "icon-sm"}
                  variant="ghost"
                  className={editing?.id === task.id ? "hidden" : "text-muted-foreground"}
                  aria-label={t("editTask", { title: task.title })}
                  title={t("editTask", { title: task.title })}
                  disabled={taskChangePending || (Boolean(editing) && editing?.id !== task.id)}
                  onClick={(event) => {
                    if (changingTask.current) return;
                    editTrigger.current = event.currentTarget;
                    setValidationError(undefined);
                    if (!createTask.isPending) createTask.reset();
                    setCompleted.reset();
                    deleteTask.reset();
                    updateTitle.reset();
                    setEditError(undefined);
                    setEditing({ id: task.id, title: task.title });
                  }}
                >
                  <PencilIcon aria-hidden="true" />
                </Button>
                <Button
                  size={compact ? "icon-xs" : "icon-sm"}
                  variant="ghost"
                  className={cn(
                    "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                    editing?.id === task.id && "hidden",
                  )}
                  aria-label={t("deleteTask", { title: task.title })}
                  title={t("deleteTask", { title: task.title })}
                  disabled={taskChangePending || Boolean(editing)}
                  onClick={() => void changeTask(() => deleteTask.mutateAsync({ id: task.id }))}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </m.li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span role="status">{t("count", { count: tasks.data?.length ?? 0 })}</span>
          <span>{t("sharedData")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
