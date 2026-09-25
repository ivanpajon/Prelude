import { type ContractRouterClient, oc } from "@orpc/contract";
import { type } from "arktype";

export const taskStatuses = ["all", "active", "completed"] as const;
export const taskStatusSchema = type.enumerated(...taskStatuses);
export type TaskStatus = typeof taskStatusSchema.infer;

// Normalize at the API boundary, then validate the title the application stores.
export const titleSchema = type("string.trim").to("1 <= string <= 120");

export const taskSchema = type({
  id: "string > 0",
  title: titleSchema,
  completed: "boolean",
});
export type Task = typeof taskSchema.infer;

export const listTasksInput = type({ status: taskStatusSchema });
export const createTaskInput = type({ title: titleSchema });
export const setCompletedInput = type({ id: "string > 0", completed: "boolean" });

export const contract = {
  tasks: {
    list: oc.input(listTasksInput).output(taskSchema.array()),
    create: oc.input(createTaskInput).output(taskSchema),
    setCompleted: oc
      .input(setCompletedInput)
      .output(taskSchema)
      .errors({ NOT_FOUND: { message: "Task not found" } }),
  },
};

export type ApiClient = ContractRouterClient<typeof contract>;
