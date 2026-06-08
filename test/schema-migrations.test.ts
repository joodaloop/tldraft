/**
 * Unit tests for the doc-migration machinery (`shared/migrations.ts`). These run
 * headlessly under `bun test` — no DOM, no server.
 *
 * There are no registered migrations yet (schema is v2), so this exercises the
 * transform helpers and the runner's contract. When you ship your first breaking
 * migration, add a frozen old-schema fixture under test/fixtures/ and assert it
 * migrates to a doc that `schema.nodeFromJSON(...).check()` accepts and whose
 * `textContent` is preserved — see the commented block at the bottom.
 */
import { test, expect } from "bun:test";

import { migrateDoc, renameNodes, renameMarks, identity } from "../shared/migrations";
import { schema, SCHEMA_VERSION, emptyDocJSON } from "../shared/schema";

test("migrating within the same version is a no-op", () => {
  const doc = emptyDocJSON();
  expect(migrateDoc(doc, SCHEMA_VERSION, SCHEMA_VERSION)).toEqual(doc);
});

test("a SCHEMA_VERSION bump with no registered migration throws", () => {
  // Guards the corruption bug: bumping the version without registering a
  // migration must fail loudly rather than silently mis-seed documents.
  expect(() => migrateDoc(emptyDocJSON(), SCHEMA_VERSION, SCHEMA_VERSION + 1)).toThrow();
});

test("renameNodes rewrites matching node types, deeply, leaving others", () => {
  const before = {
    type: "doc",
    content: [{ type: "bullet_list", content: [{ type: "list_item", content: [{ type: "paragraph" }] }] }],
  };
  const after = renameNodes({ bullet_list: "bulletList", list_item: "listItem" })(before);
  expect(after).toEqual({
    type: "doc",
    content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }],
  });
});

test("renameMarks rewrites mark types on every node", () => {
  const before = {
    type: "doc",
    content: [{ type: "text", text: "hi", marks: [{ type: "em" }, { type: "strong" }] }],
  };
  const after = renameMarks({ em: "italic" })(before);
  expect(after).toEqual({
    type: "doc",
    content: [{ type: "text", text: "hi", marks: [{ type: "italic" }, { type: "strong" }] }],
  });
});

test("identity returns the doc unchanged (for additive bumps)", () => {
  const doc = emptyDocJSON();
  expect(identity(doc as never)).toBe(doc as never);
});

test("the current empty doc is valid under the current schema", () => {
  // A canary: if the schema and emptyDocJSON ever drift apart, this fails.
  expect(() => schema.nodeFromJSON(emptyDocJSON()).check()).not.toThrow();
});

// --- Template for your first real migration ---------------------------------
// import v2doc from "./fixtures/doc-v2.json";
//
// test("v2 fixture migrates to a valid v3 doc with content preserved", () => {
//   const migrated = migrateDoc(v2doc as never, 2, SCHEMA_VERSION);
//   const node = schema.nodeFromJSON(migrated);
//   expect(() => node.check()).not.toThrow();
//   expect(node.textContent).toBe("…the fixture's expected text…");
// });
