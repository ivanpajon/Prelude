import { type ContractRouterClient, type OpenAPI, oc } from "@orpc/contract";
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

// Extend the generated body without replacing its schema or validation constraints.
function jsonExample(example: Record<string, unknown>) {
  return (operation: OpenAPI.OperationObject): OpenAPI.OperationObject => {
    const body = operation.requestBody;
    if (!body || "$ref" in body) return operation;
    return {
      ...operation,
      requestBody: {
        ...body,
        content: {
          ...body.content,
          "application/json": { ...body.content["application/json"], example },
        },
      },
    };
  };
}

export const contract = {
  tasks: {
    list: oc
      .route({
        method: "GET",
        path: "/v1/tasks",
        operationId: "listTasks",
        tags: ["Tasks"],
        summary: "List tasks",
        description:
          "Filter the shared demo list by status. For example: /api/v1/tasks?status=all.",
        spec: (operation) => ({
          ...operation,
          parameters: (operation.parameters ?? []).map((parameter) =>
            "$ref" in parameter || parameter.name !== "status"
              ? parameter
              : { ...parameter, example: "all" },
          ),
        }),
      })
      .input(listTasksInput)
      .output(taskSchema.array()),
    create: oc
      .route({
        method: "POST",
        path: "/v1/tasks",
        operationId: "createTask",
        tags: ["Tasks"],
        summary: "Create a task",
        description:
          "Add a task to the shared demo list. Titles are trimmed before validation; the normalized title must contain 1–120 characters.",
        successStatus: 201,
        successDescription: "Task created",
        spec: jsonExample({ title: "Build a feature" }),
      })
      .input(createTaskInput)
      .output(taskSchema),
    setCompleted: oc
      .route({
        method: "PATCH",
        path: "/v1/tasks/{id}",
        operationId: "setTaskCompleted",
        tags: ["Tasks"],
        summary: "Set task completion",
        description:
          "Mark a task as completed or active. Returns NOT_FOUND if the task does not exist.",
        spec: jsonExample({ completed: true }),
      })
      .input(setCompletedInput)
      .output(taskSchema)
      .errors({ NOT_FOUND: { message: "Task not found" } }),
  },
};

export type ApiClient = ContractRouterClient<typeof contract>;
