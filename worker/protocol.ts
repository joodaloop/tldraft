import type { CommitJSON, NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { z } from "zod";

const nodeJSONSchema = z.object({}).catchall(z.unknown());
const stepJSONSchema = z.object({}).catchall(z.unknown());
const selectionJSONSchema = z.object({
  anchor: z.number().int().nonnegative(),
  head: z.number().int().nonnegative(),
});
export const commitJSONSchema = z.object({
  version: z.number().int(),
  ref: z.string(),
  steps: z.array(stepJSONSchema),
}) satisfies z.ZodType<CommitJSON>;

export interface PresencePeer {
  clientId: string;
  username: string;
  color: string;
  version: number;
  selection: { anchor: number; head: number } | null;
}

export const presencePeerSchema = z.object({
  clientId: z.string().min(1).max(80),
  username: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  version: z.number().int().nonnegative(),
  selection: selectionJSONSchema.nullable(),
}) satisfies z.ZodType<PresencePeer>;

/**
 * Wire protocol between a client and the document authority.
 *
 * The whole protocol is just: the server holds the canonical doc + a strictly
 * increasing version + an append-only log of commits. Clients submit commits
 * built on some base version; the authority rebases each one forward onto the
 * current head (server-side rebasing, no CRDT) and rebroadcasts the result.
 */

/** Messages a client sends to the authority. */
export type ClientMessage =
  /** Submit a batch of steps (a "commit") built on `commit.version`. */
  | { type: "commit"; commit: CommitJSON }
  /** Share this connection's current cursor/selection and display name. */
  | { type: "presence"; peer: PresencePeer }
  /**
   * Ask to be caught up from `version` (the last version the client has
   * applied). The server replies with the commits it's missing, or a fresh
   * `init` snapshot if it can't serve them from the log.
   */
  | { type: "sync"; version: number };

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("commit"), commit: commitJSONSchema }),
  z.object({ type: z.literal("presence"), peer: presencePeerSchema }),
  z.object({ type: z.literal("sync"), version: z.number().int().finite() }),
]) satisfies z.ZodType<ClientMessage>;

/** Messages the authority sends to a client. */
export type ServerMessage =
  /** Full snapshot. Sent on connect and as a fallback for `sync`. */
  | { type: "init"; version: number; doc: NodeJSON; schemaVersion: number }
  /**
   * An applied commit, stamped with its resulting version. The submitting
   * client recognizes it by `commit.ref` and confirms its pending steps;
   * everyone else applies it as a remote change.
   */
  | { type: "commit"; commit: CommitJSON }
  /** The currently connected peers with live cursor/selection metadata. */
  | { type: "presence"; peers: PresencePeer[] }
  /** A commit was rejected (bad base version, schema failure, etc.). */
  | { type: "error"; message: string; ref?: string };

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("init"),
    version: z.number().int().finite(),
    doc: nodeJSONSchema,
    schemaVersion: z.number().int().finite(),
  }),
  z.object({ type: z.literal("commit"), commit: commitJSONSchema }),
  z.object({ type: z.literal("presence"), peers: z.array(presencePeerSchema) }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    ref: z.string().optional(),
  }),
]) satisfies z.ZodType<ServerMessage>;
