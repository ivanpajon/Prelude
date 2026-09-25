"use client";

import { createTaskInput, type TaskStatus, taskStatuses } from "@repo/contracts";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type } from "arktype";
import { CheckIcon, LayoutListIcon, PlusIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { type FormEvent, useState } from "react";
import { orpc } from "@/lib/orpc";
import { taskSearchParsers } from "@/lib/task-search";
import { useWorkbenchStore } from "./workbench-store-provider";

const filterLabels: Record<TaskStatus, string> = {
  all: "All tasks",
  active: "Active",
  completed: "Completed",
};

export function TaskWorkbench() {
  const [status, setStatus] = useQueryState(
    "status",
    taskSearchParsers.status.withOptions({ history: "push" }),
  );
  const [title, setTitle] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const compact = useWorkbenchStore((state) => state.compact);
  const toggleCompact = useWorkbenchStore((state) => state.toggleCompact);
  const queryClient = useQueryClient();
  const tasks = useQuery(orpc.tasks.list.queryOptions({ input: { status } }));
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
  const createTask = useMutation(orpc.tasks.create.mutationOptions({ onSuccess: invalidateTasks }));
  const setCompleted = useMutation(
    orpc.tasks.setCompleted.mutationOptions({ onSuccess: invalidateTasks }),
  );

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(undefined);
    createTask.reset();
    const input = createTaskInput({ title: title.trim() });
    if (input instanceof type.errors) {
      setValidationError("Enter a task between 1 and 120 characters.");
      return;
    }
    try {
      await createTask.mutateAsync(input);
      setTitle("");
    } catch {
      // Mutation state renders the error and retains the draft for retry.
    }
  }

  const error = validationError ?? createTask.error?.message ?? setCompleted.error?.message;

  return (
    <Card className="overflow-hidden bg-card shadow-none">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium">A small list. A working stack.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a first step, make it happen, and check it off.
            </p>
          </div>
          <Badge variant="secondary">Live demo</Badge>
        </div>
        <form onSubmit={submitTask} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="task-title" className="sr-only">
            New task
          </label>
          <Input
            id="task-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            required
            placeholder="What will you build next?"
            aria-describedby="task-feedback"
            className="flex-1"
          />
          <Button type="submit" disabled={createTask.isPending}>
            <PlusIcon aria-hidden="true" />
            {createTask.isPending ? "Adding…" : "Add task"}
          </Button>
        </form>
        <div
          id="task-feedback"
          aria-live="polite"
          className="mt-2 min-h-5 text-sm text-destructive"
        >
          {error}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">Filter tasks</legend>
            {taskStatuses.map((filter) => (
              <Button
                key={filter}
                variant={filter === status ? "secondary" : "ghost"}
                aria-pressed={filter === status}
                onClick={() => void setStatus(filter)}
              >
                {filterLabels[filter]}
              </Button>
            ))}
          </fieldset>
          <Button variant="ghost" onClick={toggleCompact} aria-pressed={compact}>
            <LayoutListIcon aria-hidden="true" />
            Compact view
          </Button>
        </div>
        {tasks.isPending ? (
          <p role="status" className="py-8 text-sm text-muted-foreground">
            Loading tasks…
          </p>
        ) : tasks.isError ? (
          <div role="alert" className="flex items-center justify-between gap-4 py-8">
            <p className="text-sm text-destructive">Could not load tasks. Check your connection.</p>
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              Try again
            </Button>
          </div>
        ) : tasks.data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No tasks here yet.</p>
        ) : (
          <ul aria-label="Tasks" className="divide-y">
            {tasks.data.map((task) => (
              <li
                key={task.id}
                className={cn("flex items-center gap-3", compact ? "py-2" : "py-5")}
              >
                <Button
                  size="icon-sm"
                  variant={task.completed ? "default" : "outline"}
                  aria-label={`Mark ${task.title} as ${task.completed ? "active" : "completed"}`}
                  aria-pressed={task.completed}
                  disabled={setCompleted.isPending}
                  onClick={() => setCompleted.mutate({ id: task.id, completed: !task.completed })}
                >
                  {task.completed && <CheckIcon aria-hidden="true" />}
                </Button>
                <span
                  className={cn("text-sm", task.completed && "text-muted-foreground line-through")}
                >
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span role="status">{tasks.data?.length ?? 0} tasks in this view</span>
          <span>Shared demo data · resets when the server restarts</span>
        </div>
      </CardContent>
    </Card>
  );
}
