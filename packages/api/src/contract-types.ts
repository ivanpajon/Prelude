import type { ApiClient, Task } from "@repo/contracts";

// Compile-only regression checks. This function is never called or exported by the package.
export function checkContractTypes(client: ApiClient) {
  const validResult: Promise<Task> = client.tasks.create({ title: "A valid title" });
  void validResult;

  // @ts-expect-error The contract requires a string title.
  void client.tasks.create({ title: 123 });
  // @ts-expect-error A status outside the schema's enum is not accepted.
  void client.tasks.list({ status: "archived" });
  // @ts-expect-error Completion is a boolean, not a string.
  void client.tasks.setCompleted({ id: "explore", completed: "yes" });
  // @ts-expect-error The output is a Task, not a string.
  const invalidResult: Promise<string> = client.tasks.create({ title: "A valid title" });
  void invalidResult;
}
