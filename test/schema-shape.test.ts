/**
 * Guardrail against silent document corruption.
 *
 * The schema is derived from the Tiptap extension set, and a stored doc's shape
 * is only valid as long as the schema that reads it back matches the one that
 * wrote it. If someone changes the extensions — adds/removes a node or mark,
 * renames an attr — without bumping SCHEMA_VERSION (and, for breaking changes,
 * registering a migration + fixture), old documents silently break.
 *
 * This snapshots the schema's *shape* (node/mark names + their attr names) plus
 * the current SCHEMA_VERSION. Any schema change flips this test red, forcing the
 * author to confront: "did I bump SCHEMA_VERSION and handle the migration?" Once
 * they have, they update the snapshot with `bun test --update-snapshots`.
 */
import { test, expect } from "bun:test";

import { schema, SCHEMA_VERSION } from "../shared/schema";

function schemaShape(): Record<string, unknown> {
  const shape: Record<string, unknown> = { SCHEMA_VERSION };
  for (const [name, type] of Object.entries(schema.nodes)) {
    shape[`node:${name}`] = Object.keys(type.spec.attrs ?? {}).sort();
  }
  for (const [name, type] of Object.entries(schema.marks)) {
    shape[`mark:${name}`] = Object.keys(type.spec.attrs ?? {}).sort();
  }
  return shape;
}

test("schema shape matches the committed snapshot", () => {
  expect(schemaShape()).toMatchSnapshot();
});
