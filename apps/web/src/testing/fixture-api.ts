import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { scope, type } from "arktype";

/**
 * A tiny test-only API. Infrastructure tests use it so they do not depend on the project's own
 * procedures. It covers a query input, a JSON body, a path parameter, a custom success status,
 * and a typed error.
 */
export const noteTextMaxLength = 20;

// Like the task schemas: a morph without input cloning, so deeply nested extra keys stay safe.
const $ = scope({}, { clone: false });
const textSchema = $.type("string.trim").to(`1 <= string <= ${noteTextMaxLength}`);
export const noteSchema = $.type({ id: "string > 0", text: textSchema, pinned: "boolean" });
export type Note = typeof noteSchema.infer;
export type NoteFilter = "all" | "pinned";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const fixtureContract = {
  notes: {
    list: oc
      .route({
        method: "GET",
        path: "/notes",
        operationId: "listNotes",
        summary: "List notes",
        spec: (operation) => ({ ...operation, "x-mcp": { annotations: readOnly } }),
      })
      .input(type({ filter: "'all' | 'pinned'" }))
      .output(noteSchema.array()),
    create: oc
      .route({
        method: "POST",
        path: "/notes",
        operationId: "createNote",
        summary: "Create a note",
        successStatus: 201,
        successDescription: "Note created",
      })
      .input($.type({ text: textSchema }))
      .output(noteSchema),
    update: oc
      .route({
        method: "PATCH",
        path: "/notes/{id}",
        operationId: "updateNote",
        summary: "Update a note",
      })
      .input($.type({ id: "string > 0", "text?": textSchema, "pinned?": "boolean" }))
      .output(noteSchema)
      .errors({ NOT_FOUND: { message: "Note not found" } }),
    delete: oc
      .route({
        method: "DELETE",
        path: "/notes/{id}",
        operationId: "deleteNote",
        summary: "Delete a note",
      })
      .input(type({ id: "string > 0" }))
      .output(noteSchema)
      .errors({ NOT_FOUND: { message: "Note not found" } }),
  },
};

export interface NoteStore {
  list(filter: NoteFilter): Note[];
  create(text: string): Note;
  update(id: string, changes: { text?: string; pinned?: boolean }): Note | undefined;
  delete(id: string): Note | undefined;
}

/** Fresh in-memory state for every call; returned notes are copies. */
export function createNoteStore(seed: readonly Note[] = []): NoteStore {
  const notes = new Map(seed.map((note) => [note.id, { ...note }]));
  let nextId = 1;
  return {
    list: (filter) =>
      [...notes.values()]
        .filter((note) => filter === "all" || note.pinned)
        .map((note) => ({ ...note })),
    create: (text) => {
      const note = { id: `note-${nextId++}`, text, pinned: false };
      notes.set(note.id, note);
      return { ...note };
    },
    update: (id, changes) => {
      const note = notes.get(id);
      if (!note) return undefined;
      Object.assign(note, changes);
      return { ...note };
    },
    delete: (id) => {
      const note = notes.get(id);
      notes.delete(id);
      return note && { ...note };
    },
  };
}

export interface FixtureContext {
  store: NoteStore;
  onChanged?: () => void | Promise<void>;
}

const api = implement(fixtureContract).$context<FixtureContext>();

export const fixtureRouter = api.router({
  notes: {
    list: api.notes.list.handler(({ input, context }) => context.store.list(input.filter)),
    create: api.notes.create.handler(async ({ input, context }) => {
      const note = context.store.create(input.text);
      await context.onChanged?.();
      return note;
    }),
    update: api.notes.update.handler(async ({ input: { id, ...changes }, context, errors }) => {
      const note = context.store.update(id, changes);
      if (!note) throw errors.NOT_FOUND();
      await context.onChanged?.();
      return note;
    }),
    delete: api.notes.delete.handler(async ({ input, context, errors }) => {
      const note = context.store.delete(input.id);
      if (!note) throw errors.NOT_FOUND();
      await context.onChanged?.();
      return note;
    }),
  },
});

export const fixtureSpecOptions = {
  info: { title: "Fixture API", version: "1.0.0" },
  servers: [{ url: "/api" }],
};
