import { schema as basicSchema } from "prosemirror-schema-basic";
import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

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
export const schema = basicSchema;

export const SCHEMA_VERSION = 1;

/** An empty document for this schema (a doc containing one empty paragraph). */
export function emptyDocJSON(): NodeJSON {
  return schema.topNodeType.createAndFill()!.toJSON() as NodeJSON;
}
