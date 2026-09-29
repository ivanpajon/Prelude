import type { ApiClient, Task } from "@repo/contracts";

// Compile-only regression checks. This function is never called or exported by the package.
export function checkContractTypes(client: ApiClient) {
  const validResult: Promise<Task> = client.tasks.create({ title: "A valid title" });
  void validResult;
  const deletedResult: Promise<Task> = client.tasks.delete({ id: "explore" });
  void deletedResult;
  const editedResult: Promise<Task> = client.tasks.updateTitle({ id: "explore", title: "Edited" });
  void editedResult;

  // @ts-expect-error The contract requires a string title.
  void client.tasks.create({ title: 123 });
  // @ts-expect-error A status outside the schema's enum is not accepted.
  void client.tasks.list({ status: "archived" });
  // @ts-expect-error Completion is a boolean, not a string.
  void client.tasks.setCompleted({ id: "explore", completed: "yes" });
  // @ts-expect-error Deleting a task requires a string id.
  void client.tasks.delete({ id: 123 });
  // @ts-expect-error Deleting a task requires an id.
  void client.tasks.delete({});
  // @ts-expect-error Editing a task requires a string title.
  void client.tasks.updateTitle({ id: "explore", title: 123 });
  // @ts-expect-error Editing a task requires an id.
  void client.tasks.updateTitle({ title: "Edited" });
  // @ts-expect-error The output is a Task, not a string.
  const invalidResult: Promise<string> = client.tasks.create({ title: "A valid title" });
  void invalidResult;
}
