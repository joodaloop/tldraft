import type { CommitJSON, NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { z } from "zod";

const nodeJSONSchema = z.object({}).catchall(z.unknown());
const stepJSONSchema = z.object({}).catchall(z.unknown());
export const commitJSONSchema = z.object({
  version: z.number().int().finite(),
  ref: z.string(),
  steps: z.array(stepJSONSchema),
}) satisfies z.ZodType<CommitJSON>;

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
  /**
   * Ask to be caught up from `version` (the last version the client has
   * applied). The server replies with the commits it's missing, or a fresh
   * `init` snapshot if it can't serve them from the log.
   */
  | { type: "sync"; version: number };

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("commit"), commit: commitJSONSchema }),
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
  z.object({
    type: z.literal("error"),
    message: z.string(),
    ref: z.string().optional(),
  }),
]) satisfies z.ZodType<ServerMessage>;
