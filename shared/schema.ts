import { getSchema } from "@tiptap/core";
import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { allExtensions } from "../extensions";

/**
 * The single source of truth for the document schema, shared by the authority
 * (the Durable Object) and every client. Because the authority rejects steps
 * that don't fit this schema, both sides MUST build documents from the exact
 * same spec — see the "Yjs is at odds with document schemas" section of the
 * article: with a real authority, schema validation is just the server saying
 * "no" to an invalid Transaction.
 *
 * Bump SCHEMA_VERSION whenever the schema changes shape. Clients compare it
 * against the value in the `init` message and should refuse to edit on a
 * mismatch rather than silently corrupting the document during an upgrade.
 */
// Derived from the Tiptap extension kit via `getSchema`, so the authority (the
// Durable Object) and every client validate against the exact same ProseMirror
// schema. `getSchema` reads only the schema parts of each extension and never
// touches the DOM, so this is safe to evaluate in the Worker too.
export const schema = getSchema(allExtensions);

// Bumped from 1: the schema shape changed wholesale (basicSchema -> Tiptap kit;
// node/mark names differ), so v1 documents are intentionally incompatible.
export const SCHEMA_VERSION = 2;

/**
 * An empty document for this schema: an empty level-1 heading followed by an
 * empty paragraph. The two empty textblocks give the Placeholder extension
 * something to hang the title and body hints on, so a blank draft reads as a
 * titled page rather than a single stray line.
 */
export function emptyDocJSON(): NodeJSON {
  const heading = schema.nodes.heading.createAndFill({ level: 1 })!;
  const paragraph = schema.nodes.paragraph.createAndFill()!;
  return schema.topNodeType.create(null, [heading, paragraph]).toJSON() as NodeJSON;
}
