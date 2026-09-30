import { expect, test } from "@playwright/test";

export function localizationAcceptance() {
  test("switches actual URL policies with keyboard controls and preserves document state", async ({
    page,
  }) => {
    await page.goto("/en/playground");
    const draft = `Keep this draft ${crypto.randomUUID()}`;
    await page.getByRole("button", { name: "Compact view", exact: true }).click();
    await page.getByRole("textbox", { name: "New task", exact: true }).fill(draft);
    await page.getByRole("button", { name: "Discover tools", exact: true }).click();
    const argumentsDraft = '{"status":"active"}';
    await page.getByRole("textbox", { name: "Arguments JSON", exact: true }).fill(argumentsDraft);
    await page.getByRole("link", { name: "Prelude home", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/en");
    const documentId = await page.evaluate(() => {
      const id = crypto.randomUUID();
      Reflect.set(window, "routingDocumentId", id);
      // Give both transitions query/fragment state without introducing a document load.
      history.replaceState(history.state, "", `${location.pathname}?preview=1#main-content`);
      return id;
    });
    const mode = page.getByRole("switch", { name: "Language in URL", exact: true });
    await expect(mode).toBeChecked();
    await mode.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/\?preview=1#main-content$/);
    await expect(mode).not.toBeChecked();
    await expect(page.getByRole("link", { name: "Open playground", exact: true })).toHaveAttribute(
      "href",
      "/playground",
    );
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveURL(/\/\?preview=1#main-content$/);
    const spanishMode = page.getByRole("switch", { name: "Idioma en la URL", exact: true });
    await spanishMode.focus();
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(/\/es\?preview=1#main-content$/);
    await expect(spanishMode).toBeChecked();
    expect(await page.evaluate(() => Reflect.get(window, "routingDocumentId"))).toBe(documentId);
    await expect(page.getByRole("link", { name: "Zona de pruebas", exact: true })).toHaveAttribute(
      "href",
      "/es/playground",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("link", { name: "Zona de pruebas", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Nueva tarea", exact: true })).toHaveValue(
      draft,
    );
    await expect(page.getByRole("textbox", { name: "Argumentos JSON", exact: true })).toHaveValue(
      argumentsDraft,
    );
    await expect(page.getByRole("button", { name: "Vista compacta", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/es\?preview=1#main-content$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/es\/playground$/);
    await expect(page.getByRole("textbox", { name: "Nueva tarea", exact: true })).toHaveValue(
      draft,
    );
  });

  test("persists hidden URLs until an explicit language link is opened", async ({ page }) => {
    await page.goto("/es");
    await page.getByRole("switch", { name: "Idioma en la URL", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(
      page.getByRole("switch", { name: "Idioma en la URL", exact: true }),
    ).not.toBeChecked();
    await page.getByRole("link", { name: "Zona de pruebas", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/playground");
    await page.getByRole("button", { name: "Pendientes", exact: true }).click();
    await expect(page).toHaveURL(/\/playground\?status=active$/);
    await page.getByRole("combobox", { name: "Idioma", exact: true }).selectOption("en");
    await expect(page).toHaveURL(/\/playground\?status=active$/);
    await expect(page.getByRole("button", { name: "Active", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.goto("/es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("switch", { name: "Idioma en la URL", exact: true })).toBeChecked();
    await expect(page.getByRole("link", { name: "Zona de pruebas", exact: true })).toHaveAttribute(
      "href",
      "/es/playground",
    );
  });

  test("retains drafts, errors, density, and filter history while changing language", async ({
    page,
  }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: "Active", exact: true }).click();
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    const draft = "   ";
    await page.getByRole("textbox", { name: "New task", exact: true }).fill(draft);
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(
      page.getByText("Enter a task between 1 and 120 characters.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Compact view", exact: true }).click();
    await page.getByRole("button", { name: "Discover tools", exact: true }).click();
    await page.getByRole("textbox", { name: "Arguments JSON", exact: true }).fill("{");
    await page.getByRole("button", { name: "Run tool", exact: true }).click();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
    await expect(page.getByRole("textbox", { name: "Nueva tarea", exact: true })).toHaveValue(
      draft,
    );
    await expect(page.getByRole("button", { name: "Vista compacta", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByText("Escribe una tarea de entre 1 y 120 caracteres.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Argumentos JSON", exact: true })).toHaveValue(
      "{",
    );
    await expect(page.getByRole("alert").filter({ hasText: "JSON válido" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/playground\?status=active$/);
    await expect(page.getByRole("button", { name: "Active", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("textbox", { name: "New task", exact: true })).toHaveValue(draft);
  });

  test("changes the explicit language route while preserving filters and anchors", async ({
    page,
  }) => {
    await page.goto("/playground?status=active#mcp");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const selector = page.getByRole("combobox", { name: "Language", exact: true });
    await selector.selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveURL(/\/es\/playground\?status=active#mcp$/);
    await expect(page).toHaveTitle("Zona de pruebas — Prelude");
    await expect(page.getByRole("button", { name: "Pendientes", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("list", { name: "Tareas", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Descubrir herramientas", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.getByRole("link", { name: "Inicio de Prelude", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/es");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Menos configuración\.\s*Más creación\./,
    );
    await expect(page.getByText("Aplicación", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Guardar idea", exact: true }).click();
    await expect(page.getByRole("button", { name: "Idea guardada", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("combobox", { name: "Idioma", exact: true }).selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Application", { exact: true })).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/en");
  });

  test("supports Spanish task mutations and browser filter history", async ({ page, request }) => {
    const title = `Tarea sin traducir ${crypto.randomUUID()}`;
    let taskId: string | undefined;
    try {
      await page.goto("/playground");
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
      const input = page.getByRole("textbox", { name: "Nueva tarea", exact: true });
      await input.fill(`  ${title}  `);
      await page.getByRole("button", { name: "Añadir tarea", exact: true }).click();
      await expect(
        page.getByRole("list", { name: "Tareas" }).getByText(title, { exact: true }),
      ).toBeVisible();
      const response = await request.get("/api/v1/tasks?status=all");
      const tasks = (await response.json()) as { id: string; title: string }[];
      taskId = tasks.find((task) => task.title === title)?.id;
      expect(taskId).toBeTruthy();
      await page.getByRole("button", { name: `Editar ${title}`, exact: true }).click();
      await page
        .getByRole("textbox", { name: "Título de la tarea", exact: true })
        .fill(`${title} editada`);
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await expect(
        page.getByRole("button", { name: `Editar ${title} editada`, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: `Marcar ${title} editada como completada`, exact: true })
        .click();
      await page.getByRole("button", { name: "Pendientes", exact: true }).click();
      await expect(page).toHaveURL(/\?status=active$/);
      await page.getByRole("button", { name: "Completadas", exact: true }).click();
      await expect(page).toHaveURL(/\?status=completed$/);
      await page.goBack();
      await expect(page.getByRole("button", { name: "Pendientes", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.goForward();
      await expect(page.getByRole("button", { name: "Completadas", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.getByRole("button", { name: `Eliminar ${title} editada`, exact: true }).click();
      await expect(
        page.getByRole("list", { name: "Tareas" }).getByText(`${title} editada`, { exact: true }),
      ).toHaveCount(0);
      taskId = undefined;
    } finally {
      if (taskId) await request.delete(`/api/v1/tasks/${taskId}`);
    }
  });

  test("localizes missing pages and keeps API documentation links usable", async ({ page }) => {
    const validationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /instant|validation boundary/i.test(message.text())) {
        validationErrors.push(message.text());
      }
    });
    await page.goto("/");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
    const docs = page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Documentación de la API", exact: true });
    await expect(docs).toHaveAttribute("href", "/api/docs");
    const prefixed = await page.request.get("/es/playground?status=active", {
      maxRedirects: 0,
    });
    expect(prefixed.status()).toBe(200);
    expect(prefixed.headers().location).toBeUndefined();
    await page.goto("/es/playground?status=active");
    await expect(page).toHaveURL(/\/es\/playground\?status=active$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const response = await page.goto("/missing-page");
    // Next.js returns 200 for a not-found boundary in a streamed response.
    expect([200, 404]).toContain(response?.status());
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Un nuevo rumbo.");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(validationErrors).toEqual([]);
  });
}
