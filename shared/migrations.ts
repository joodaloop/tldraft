import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

/**
 * Document schema migrations.
 *
 * A ProseMirror doc is a JSON tree (`{ type, attrs?, content?, marks?, text? }`).
 * A migration is a *pure JSON→JSON transform* applied to a stored doc before it
 * is handed to `schema.nodeFromJSON`. It runs as a plain tree rewrite and does
 * NOT depend on the old schema being instantiable — important, because once an
 * extension is removed its node/mark types no longer exist in code, so
 * Transform/Step-based migrations are impossible.
 *
 * `migrateDoc` brings a doc from its stored schema version up to the current
 * `SCHEMA_VERSION`, applying each registered step in order. The authority runs
 * it lazily in `onStart` (see `worker/index.ts`): each document migrates the
 * next time its Durable Object wakes, gated on the stored `schemaVersion`.
 *
 * There are no migrations yet (current schema is v2). The plumbing is inert
 * until the first post-launch schema change.
 */

/** A ProseMirror node in its serialized JSON form. */
interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: unknown[];
  text?: string;
}

/** Transforms a doc from schema version N into the shape schema version N+1 expects. */
export type DocMigration = (doc: PMNode) => PMNode;

/**
 * Registered migrations, keyed by their SOURCE version: `DOC_MIGRATIONS[2]`
 * turns a v2 doc into a v3 doc. EVERY version bump needs an entry here, even an
 * additive one — register `identity` for additive changes (new optional
 * nodes/marks, new attrs with defaults) where old docs are already valid under
 * the new schema and need no rewrite. The explicit entry is the point: it forces
 * a deliberate "additive (identity) or breaking (transform)?" decision so a
 * forgotten migration fails loudly instead of silently corrupting documents.
 *
 * Example of a breaking rename (snake_case → camelCase), for when you need it:
 *
 *   2: renameNodes({
 *     bullet_list: "bulletList",
 *     ordered_list: "orderedList",
 *     list_item: "listItem",
 *     code_block: "codeBlock",
 *   }),
 */
const DOC_MIGRATIONS: Record<number, DocMigration> = {
  // empty — see the docstring above before adding an entry.
};

/** A no-op migration. Register this for purely additive schema bumps. */
export const identity: DocMigration = (doc) => doc;

/** Depth-first rewrite: apply `fn` to every node in the tree, returning a copy. */
function mapNodes(node: PMNode, fn: (n: PMNode) => PMNode): PMNode {
  const mapped = fn(node);
  if (!mapped.content) return mapped;
  return { ...mapped, content: mapped.content.map((child) => mapNodes(child, fn)) };
}

/** Build a migration that renames node types per `map`, leaving others untouched. */
export function renameNodes(map: Record<string, string>): DocMigration {
  return (doc) => mapNodes(doc, (n) => (map[n.type] ? { ...n, type: map[n.type] } : n));
}

/** Build a migration that renames mark types per `map` on every node. */
export function renameMarks(map: Record<string, string>): DocMigration {
  const rename = (mark: unknown): unknown => {
    if (mark && typeof mark === "object") {
      const m = mark as { type?: string };
      if (m.type && map[m.type]) return { ...m, type: map[m.type] };
    }
    return mark;
  };
  return (doc) =>
    mapNodes(doc, (n) => (n.marks ? { ...n, marks: n.marks.map(rename) } : n));
}

/**
 * Bring `doc` from schema version `from` up to `to`, applying each registered
 * migration in order. Throws if a step in the range isn't registered — that's
 * the loud failure that catches a `SCHEMA_VERSION` bump made without a migration.
 */
export function migrateDoc(doc: NodeJSON, from: number, to: number): NodeJSON {
  let out = doc as unknown as PMNode;
  for (let v = from; v < to; v++) {
    const step = DOC_MIGRATIONS[v];
    if (!step) {
      throw new Error(
        `no doc migration registered for schema v${v} → v${v + 1} ` +
          `(register \`identity\` in DOC_MIGRATIONS for an additive change)`,
      );
    }
    out = step(out);
  }
  return out as unknown as NodeJSON;
}
