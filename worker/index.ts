import { routePartykitRequest, Server, type Connection, type WSMessage } from "partyserver";
import { applyCommitJSON } from "@stepwisehq/prosemirror-collab-commit/apply-commit";
import type { CommitJSON, NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { schema, emptyDocJSON, SCHEMA_VERSION } from "../shared/schema";
import type { ClientMessage, ServerMessage } from "./protocol";

export interface Env {
  DocumentServer: DurableObjectNamespace<DocumentServer>;
  /** Static SPA assets, served for any request the worker doesn't handle. */
  ASSETS: Fetcher;
}

// --- Storage keys -----------------------------------------------------------
// Durable Object storage is a simple key/value store. We keep the head version
// and the latest doc snapshot under fixed keys, plus an append-only commit log
// keyed by the version each commit produced. Versions are zero-padded so the
// keys sort lexicographically in version order, which lets `storage.list`
// return a contiguous, ordered slice of the log.
const VERSION_KEY = "version";
const DOC_KEY = "doc";
const SCHEMA_KEY = "schemaVersion";
const COMMIT_PREFIX = "commit:";
const commitKey = (version: number) => COMMIT_PREFIX + String(version).padStart(12, "0");

/**
 * One instance per document (one Durable Object per room name). This is the
 * "authority" from the article: it owns the source of truth — the document,
 * the applied commits, and the current version — and it rebases every incoming
 * commit onto the head before broadcasting it.
 */
export class DocumentServer extends Server<Env> {
  // Hibernate when idle; `onStart` reloads state from storage on wake.
  static options = { hibernate: true };

  #version = 0;
  #doc: NodeJSON = emptyDocJSON();

  /**
   * Serializes commit processing. Every incoming commit is rebased and applied
   * one at a time, so the version increments atomically and broadcasts go out
   * in strict version order. This is load-bearing: a client's
   * `receiveCommitTransaction` throws unless the commit's version is exactly
   * its next expected version, so out-of-order delivery would desync clients.
   */
  #tail: Promise<unknown> = Promise.resolve();

  async onStart() {
    const stored = await this.ctx.storage.get<unknown>([VERSION_KEY, DOC_KEY]);
    const version = stored.get(VERSION_KEY) as number | undefined;
    const doc = stored.get(DOC_KEY) as NodeJSON | undefined;

    if (version === undefined || doc === undefined) {
      // First time this document is opened — initialize an empty doc at v0.
      this.#version = 0;
      this.#doc = emptyDocJSON();
      await this.ctx.storage.put({
        [VERSION_KEY]: this.#version,
        [DOC_KEY]: this.#doc,
        [SCHEMA_KEY]: SCHEMA_VERSION,
      });
    } else {
      this.#version = version;
      this.#doc = doc;
    }
  }

  onConnect(connection: Connection) {
    // Hand the new client a full snapshot to seed its collab plugin with
    // `initCollabState(state, version, doc)`.
    this.#send(connection, {
      type: "init",
      version: this.#version,
      doc: this.#doc,
      schemaVersion: SCHEMA_VERSION,
    });
  }

  onMessage(connection: Connection, raw: WSMessage) {
    let msg: ClientMessage;
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      this.#send(connection, { type: "error", message: "invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "commit":
        this.#enqueue(() => this.#applyCommit(connection, msg.commit));
        return;
      case "sync":
        this.#enqueue(() => this.#syncClient(connection, msg.version));
        return;
      default:
        this.#send(connection, { type: "error", message: "unknown message type" });
    }
  }

  /** Run `task` after all previously-enqueued work, swallowing rejections. */
  #enqueue(task: () => Promise<void>) {
    this.#tail = this.#tail.then(task).catch((err) => {
      console.error("[DocumentServer] task failed", err);
    });
  }

  /**
   * Rebase one client commit onto the current head and, if it applies, advance
   * the document and broadcast the result.
   *
   * The incoming commit is built on `commit.version` (its base). We gather every
   * commit applied since that base and hand them to `applyCommitJSON`, which
   * maps the commit's steps forward over them, drops any that no longer fit,
   * applies the rest, and returns the new doc plus a commit re-stamped with the
   * resulting version (`#version + 1`).
   */
  async #applyCommit(connection: Connection, incoming: CommitJSON) {
    const base = incoming.version;

    if (base < 0 || base > this.#version) {
      this.#send(connection, {
        type: "error",
        ref: incoming.ref,
        message: `commit base version ${base} is invalid (head is ${this.#version})`,
      });
      return;
    }

    const since = await this.#commitsSince(base);

    let result: { docJSON: NodeJSON; commitJSON: CommitJSON };
    try {
      result = applyCommitJSON(this.#version, schema, this.#doc, since, incoming);
    } catch (err) {
      // e.g. the commit references nodes/marks outside the schema. We reject it
      // instead of letting it corrupt the document.
      this.#send(connection, {
        type: "error",
        ref: incoming.ref,
        message: `failed to apply commit: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    const applied = result.commitJSON; // version === previous #version + 1
    this.#doc = result.docJSON;
    this.#version = applied.version;

    await this.ctx.storage.put({
      [VERSION_KEY]: this.#version,
      [DOC_KEY]: this.#doc,
      [commitKey(this.#version)]: applied,
    });

    // Broadcast to *everyone*, including the submitter. The submitter matches
    // `applied.ref` to confirm its own pending steps; others apply it as a
    // remote change.
    this.#broadcast({ type: "commit", commit: applied });
  }

  /** Catch a reconnecting client up from `from`, or snapshot if we can't. */
  async #syncClient(connection: Connection, from: number) {
    if (from < 0 || from > this.#version) {
      this.#send(connection, {
        type: "init",
        version: this.#version,
        doc: this.#doc,
        schemaVersion: SCHEMA_VERSION,
      });
      return;
    }

    const missing = await this.#commitsSince(from);
    // If the log doesn't cover the whole gap (e.g. it was trimmed), fall back
    // to a snapshot so the client can't silently end up missing changes.
    if (missing.length !== this.#version - from) {
      this.#send(connection, {
        type: "init",
        version: this.#version,
        doc: this.#doc,
        schemaVersion: SCHEMA_VERSION,
      });
      return;
    }
    for (const commit of missing) {
      this.#send(connection, { type: "commit", commit });
    }
  }

  /** All commits with version in (base, head], in ascending version order. */
  async #commitsSince(base: number): Promise<CommitJSON[]> {
    if (base >= this.#version) return [];
    const map = await this.ctx.storage.list<CommitJSON>({
      prefix: COMMIT_PREFIX,
      start: commitKey(base + 1),
    });
    return [...map.values()];
  }

  #send(connection: Connection, msg: ServerMessage) {
    connection.send(JSON.stringify(msg));
  }

  #broadcast(msg: ServerMessage) {
    this.broadcast(JSON.stringify(msg));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ??
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
