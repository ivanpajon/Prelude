import type { Task } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, createDemoRepository, type TaskRepository } from "./index";

describe("contract-first task API", () => {
  it("starts with three deterministic tasks and filters by status", async () => {
    const client = createApiClient({ repository: createDemoRepository() });
    const all = await client.tasks.list({ status: "all" });
    const active = await client.tasks.list({ status: "active" });
    const completed = await client.tasks.list({ status: "completed" });

    expect(all.map((task) => task.id)).toEqual(["explore", "feature", "customize"]);
    expect(active).toHaveLength(2);
    expect(active.every((task) => !task.completed)).toBe(true);
    expect(completed).toHaveLength(1);
    expect(completed.every((task) => task.completed)).toBe(true);
  });

  it("normalizes titles and makes successful mutations visible to later reads", async () => {
    const changed = vi.fn();
    const client = createApiClient({
      repository: createDemoRepository([]),
      onTasksChanged: changed,
    });
    const task = await client.tasks.create({ title: "  Build a feature  " });

    expect(task).toMatchObject({ title: "Build a feature", completed: false });
    expect(task.id).not.toBe("");
    await expect(client.tasks.setCompleted({ id: task.id, completed: true })).resolves.toEqual({
      ...task,
      completed: true,
    });
    await expect(client.tasks.list({ status: "active" })).resolves.toEqual([]);
    await expect(client.tasks.list({ status: "completed" })).resolves.toEqual([
      { ...task, completed: true },
    ]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it.each(["", "   ", "x".repeat(121)])(
    "rejects an invalid title before writing: %j",
    async (title) => {
      const repository = createDemoRepository([]);
      const changed = vi.fn();
      const client = createApiClient({ repository, onTasksChanged: changed });

      await expect(client.tasks.create({ title })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(repository.list("all")).toEqual([]);
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it("accepts the normalized title at the length limit", async () => {
    const client = createApiClient({ repository: createDemoRepository([]) });
    await expect(client.tasks.create({ title: ` ${"x".repeat(120)} ` })).resolves.toMatchObject({
      title: "x".repeat(120),
    });
  });

  it("validates runtime types even through an in-process client", async () => {
    const client = createApiClient({ repository: createDemoRepository() });
    await expect(client.tasks.create({ title: 42 as unknown as string })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.tasks.list({ status: "invalid" as "all" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      client.tasks.setCompleted({ id: "explore", completed: "yes" as unknown as boolean }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns a typed NOT_FOUND error without invalidating caches", async () => {
    const changed = vi.fn();
    const client = createApiClient({ repository: createDemoRepository(), onTasksChanged: changed });
    await expect(
      client.tasks.setCompleted({ id: "missing", completed: true }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Task not found",
    });
    expect(changed).not.toHaveBeenCalled();
  });

  it("rejects invalid repository output at the contract boundary", async () => {
    const faulty: TaskRepository = {
      ...createDemoRepository(),
      list: () => [{ id: "bad", title: 42, completed: false } as unknown as Task],
    };
    const client = createApiClient({ repository: faulty });
    await expect(client.tasks.list({ status: "all" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("keeps concurrent clients bound to their own request context", async () => {
    const firstChanged = vi.fn();
    const secondChanged = vi.fn();
    const first = createApiClient({
      repository: createDemoRepository([]),
      onTasksChanged: firstChanged,
    });
    const second = createApiClient({
      repository: createDemoRepository([]),
      onTasksChanged: secondChanged,
    });

    await Promise.all([
      first.tasks.create({ title: "First context" }),
      second.tasks.create({ title: "Second context" }),
    ]);

    const firstTasks = await first.tasks.list({ status: "all" });
    const secondTasks = await second.tasks.list({ status: "all" });
    expect(firstTasks.map((task) => task.title)).toEqual(["First context"]);
    expect(secondTasks.map((task) => task.title)).toEqual(["Second context"]);
    expect(firstChanged).toHaveBeenCalledOnce();
    expect(secondChanged).toHaveBeenCalledOnce();
  });

  it("awaits an asynchronous cache invalidator before resolving a mutation", async () => {
    let invalidated = false;
    const client = createApiClient({
      repository: createDemoRepository([]),
      onTasksChanged: async () => {
        await Promise.resolve();
        invalidated = true;
      },
    });
    await client.tasks.create({ title: "Fresh data" });
    expect(invalidated).toBe(true);
  });
});

describe("demo repository ownership", () => {
  it("copies seeds and results so callers cannot mutate backing state", () => {
    const seed: Task = { id: "seed", title: "Original", completed: false };
    const repository = createDemoRepository([seed]);
    seed.title = "Mutated seed";
    const result = repository.list("all");
    const returned = result[0];
    expect(returned).toBeDefined();
    if (returned) returned.title = "Mutated result";

    expect(repository.list("all")).toEqual([{ id: "seed", title: "Original", completed: false }]);
    const created = repository.create("Created");
    created.completed = true;
    expect(repository.list("completed")).toEqual([]);
    const updated = repository.setCompleted(created.id, true);
    if (updated) updated.title = "Mutated update";
    expect(repository.list("completed").map((task) => task.title)).toEqual(["Created"]);
  });
});
