import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { MotionProvider } from "@repo/ui/components/motion-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, expect, it, vi } from "vitest";
import { orpc } from "@/lib/orpc";
import { createWorkbenchStore } from "@/stores/workbench-store";
import { TaskWorkbench } from "./task-workbench";
import { WorkbenchStoreProvider } from "./workbench-store-provider";

// Materialize the task utilities so individual mutation options can be isolated
// without replacing the real query keys used by the workbench.
vi.mock("@/lib/orpc", async (importOriginal) => {
  const { orpc } = await importOriginal<typeof import("../lib/orpc")>();
  const tasks = orpc.tasks;
  return {
    orpc: {
      tasks: {
        key: tasks.key,
        list: tasks.list,
        create: { mutationOptions: tasks.create.mutationOptions },
        setCompleted: tasks.setCompleted,
        updateTitle: tasks.updateTitle,
        delete: tasks.delete,
      },
    },
  };
});

const clients: QueryClient[] = [];
const task = { id: "demo-task", title: "Keep the user's words", completed: false };

function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(orpc.tasks.list.queryOptions({ input: { status: "all" } }).queryKey, [task]);
  clients.push(client);
  const store = createWorkbenchStore();
  const view = (locale: Locale) => (
    <NextIntlClientProvider
      key={locale}
      locale={locale}
      messages={getMessages(locale)}
      timeZone="UTC"
    >
      <NuqsTestingAdapter>
        <QueryClientProvider client={client}>
          <WorkbenchStoreProvider store={store}>
            <MotionProvider>
              <TaskWorkbench />
            </MotionProvider>
          </WorkbenchStoreProvider>
        </QueryClientProvider>
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  const rendered = render(view("en"));
  return {
    ...rendered,
    client,
    store,
    locale: (locale: Locale) => rendered.rerender(view(locale)),
  };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

it("retranslates create validation and counts without replacing user task data or drafts", async () => {
  const user = userEvent.setup();
  const { locale } = fixture();
  const input = screen.getByRole("textbox", { name: "New task" });
  await user.type(input, "   ");
  await user.click(screen.getByRole("button", { name: "Add task" }));
  expect(screen.getByText("Enter a task between 1 and 120 characters.")).toBeVisible();
  expect(screen.getByText("1 task in this view")).toBeVisible();

  locale("es");
  expect(screen.getByText("Escribe una tarea de entre 1 y 120 caracteres.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Nueva tarea" })).toHaveValue("   ");
  expect(screen.getByText("1 tarea en esta vista")).toBeVisible();
  expect(screen.getByText(task.title)).toBeVisible();
  expect(screen.getByRole("button", { name: `Editar ${task.title}` })).toBeVisible();
  expect(screen.getByRole("button", { name: "Pendientes" })).toBeVisible();
});

it("keeps an edit draft and retranslates its validation after a live locale change", async () => {
  const user = userEvent.setup();
  const { locale } = fixture();
  await user.type(screen.getByRole("textbox", { name: "New task" }), "Keep my draft");
  await user.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
  const input = screen.getByRole("textbox", { name: "Task title" });
  await user.clear(input);
  await user.type(input, "   ");
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a task between 1 and 120 characters.");

  locale("es");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Escribe una tarea de entre 1 y 120 caracteres.",
  );
  expect(screen.getByRole("textbox", { name: "Título de la tarea" })).toHaveValue("   ");
  expect(screen.getByRole("textbox", { name: "Nueva tarea" })).toHaveValue("Keep my draft");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("button", { name: `Editar ${task.title}` })).toHaveFocus();
  expect(screen.getByText(task.title)).toBeVisible();
});

it("retains pending creation across a locale remount and preserves a newer draft after completion", async () => {
  const user = userEvent.setup();
  let complete!: (value: typeof task) => void;
  const response = new Promise<typeof task>((resolve) => {
    complete = resolve;
  });
  const create = vi.fn(() => response);
  vi.spyOn(orpc.tasks.create, "mutationOptions").mockReturnValue({ mutationFn: create });
  const { locale } = fixture();
  await user.type(screen.getByRole("textbox", { name: "New task" }), "First draft");
  await user.click(screen.getByRole("button", { name: "Add task" }));
  expect(create).toHaveBeenCalledOnce();

  locale("es");
  const input = screen.getByRole("textbox", { name: "Nueva tarea" });
  expect(input).toHaveValue("First draft");
  expect(screen.getByRole("button", { name: "Añadiendo…" })).toBeDisabled();
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  expect(create).toHaveBeenCalledOnce();
  await user.clear(input);
  await user.type(input, "Keep this newer draft");
  await act(async () => complete({ ...task, id: "created", title: "First draft" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Añadir tarea" })).toBeEnabled());
  expect(input).toHaveValue("Keep this newer draft");
});
