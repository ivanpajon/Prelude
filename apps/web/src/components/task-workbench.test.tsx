import type { Locale } from "@repo/i18n";
import { getMessages } from "@repo/i18n/messages";
import { MotionProvider } from "@repo/ui/components/motion-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, expect, it } from "vitest";
import { orpc } from "@/lib/orpc";
import { TaskWorkbench } from "./task-workbench";
import { WorkbenchStoreProvider } from "./workbench-store-provider";

const clients: QueryClient[] = [];
const task = { id: "demo-task", title: "Keep the user's words", completed: false };

function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(orpc.tasks.list.queryOptions({ input: { status: "all" } }).queryKey, [task]);
  clients.push(client);
  const view = (locale: Locale) => (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="UTC">
      <NuqsTestingAdapter>
        <QueryClientProvider client={client}>
          <WorkbenchStoreProvider>
            <MotionProvider>
              <TaskWorkbench />
            </MotionProvider>
          </WorkbenchStoreProvider>
        </QueryClientProvider>
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  const rendered = render(view("en"));
  return { ...rendered, locale: (locale: Locale) => rendered.rerender(view(locale)) };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
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
