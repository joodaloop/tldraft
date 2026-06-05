import { routePartykitRequest, Server, type Connection, type WSMessage } from "partyserver";
import { applyCommitJSON } from "@stepwisehq/prosemirror-collab-commit/apply-commit";
import type { CommitJSON, NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { schema, emptyDocJSON, SCHEMA_VERSION } from "../shared/schema";
import { migrateDoc } from "../shared/migrations";
import { routeApiRequest } from "./api";
import type { ClientMessage, ServerMessage } from "./protocol";

export interface Env {
  DocumentServer: DurableObjectNamespace<DocumentServer>;
  /** D1 database for account metadata and saved page mappings. */
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  /** Static SPA assets, served for any request the worker doesn't handle. */
  ASSETS: Fetcher;
}

// --- Storage keys -----------------------------------------------------------
// Durable Object storage is a simple key/value store. We keep the head version
// and the latest doc snapshot under fixed keys, plus an append-only commit log
// keyed by the version each commit produced. Versions are zero-padded so the
// keys sort lexicographically in version order, which lets `storage.list`
// return a contiguous, ordered slice of the log.
//
// The durable log is never trimmed — it's the complete history. On top of it we
// keep a bounded in-memory window of the most recent commits (`#log`) so the
// common catch-up (a client that blinked offline for a moment) is served
// straight from RAM. Only that window is trimmed; clients further behind than
// the window fall back to reading the full range from durable storage.
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
  static readonly IDLE_UPDATE_DELAY_MS = 30_000;
  /** How many recent commits to keep in memory for fast catch-up. */
  static readonly MAX_INMEMORY_COMMITS = 512;

  #version = 0;
  #doc: NodeJSON = emptyDocJSON();

  /**
   * The most recent commits, in ascending version order, capped at
   * `MAX_INMEMORY_COMMITS`. A cache over the durable log: it covers versions
   * `(#version - #log.length, #version]`. Empty after a hibernation wake and
   * refills as new commits arrive — anything it doesn't cover is read back from
   * durable storage on demand.
   */
  #log: CommitJSON[] = [];

  /**
   * Serializes commit processing. Every incoming commit is rebased and applied
   * one at a time, so the version increments atomically and broadcasts go out
   * in strict version order. This is load-bearing: a client's
   * `receiveCommitTransaction` throws unless the commit's version is exactly
   * its next expected version, so out-of-order delivery would desync clients.
   */
  #tail: Promise<unknown> = Promise.resolve();

  async onAlarm() {
    await this.#touchPage();
  }

  async onStart() {
    const stored = await this.ctx.storage.get<unknown>([VERSION_KEY, DOC_KEY, SCHEMA_KEY]);
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
      await this.env.DB.prepare(
        "INSERT OR IGNORE INTO pages (id, title, body, updated_at) VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
      )
        .bind(this.name, ...this.#pageText())
        .run();
    } else {
      this.#version = version;
      this.#doc = doc;
      // Docs without SCHEMA_KEY predate the field; treat them as current (there
      // are none in practice — SCHEMA_KEY has always been written at creation).
      const storedSchema = (stored.get(SCHEMA_KEY) as number | undefined) ?? SCHEMA_VERSION;
      if (storedSchema < SCHEMA_VERSION) {
        // Migrate before #pageText() below reads the doc through the new schema.
        await this.#migrateSchema(storedSchema);
      } else if (stored.get(SCHEMA_KEY) === undefined) {
        await this.ctx.storage.put({ [SCHEMA_KEY]: SCHEMA_VERSION });
      }
      await this.env.DB.prepare("INSERT OR IGNORE INTO pages (id, title, body) VALUES (?1, ?2, ?3)")
        .bind(this.name, ...this.#pageText())
        .run();
    }
  }

  /**
   * Bring the stored doc from an older schema version up to the current one,
   * then invalidate the commit log. The log's commits are authored under the old
   * schema and can't rebase onto the migrated doc, so we drop them and let
   * reconnecting clients re-`init` from the migrated snapshot (they already
   * halt+reload on a schemaVersion bump, so they re-seed regardless). An additive
   * migration registers `identity` and strictly speaking wouldn't need the log
   * cleared, but we do it uniformly to keep one invariant: the durable log only
   * ever holds current-schema commits.
   */
  async #migrateSchema(from: number) {
    this.#doc = migrateDoc(this.#doc, from, SCHEMA_VERSION);
    // Fail loudly rather than persist a doc that doesn't fit the schema.
    schema.nodeFromJSON(this.#doc).check();

    const old = await this.ctx.storage.list({ prefix: COMMIT_PREFIX });
    if (old.size > 0) await this.ctx.storage.delete([...old.keys()]);
    this.#log = [];

    await this.ctx.storage.put({
      [DOC_KEY]: this.#doc,
      [SCHEMA_KEY]: SCHEMA_VERSION,
    });
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

    // Append to the in-memory window and drop the oldest if it overflows. The
    // durable write below keeps the full history regardless.
    this.#log.push(applied);
    if (this.#log.length > DocumentServer.MAX_INMEMORY_COMMITS) {
      this.#log.splice(0, this.#log.length - DocumentServer.MAX_INMEMORY_COMMITS);
    }

    await this.ctx.storage.put({
      [VERSION_KEY]: this.#version,
      [DOC_KEY]: this.#doc,
      [commitKey(this.#version)]: applied,
    });
    await this.ctx.storage.setAlarm(Date.now() + DocumentServer.IDLE_UPDATE_DELAY_MS);

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

  /**
   * All commits with version in (base, head], in ascending version order.
   * Served from the in-memory window when it reaches back far enough; otherwise
   * read in full from the durable log.
   */
  async #commitsSince(base: number): Promise<CommitJSON[]> {
    if (base >= this.#version) return [];

    // Lowest version currently held in memory (or head+1 when empty).
    const memLow = this.#log.length > 0 ? this.#log[0].version : this.#version + 1;
    if (base + 1 >= memLow) {
      // The whole range is in the window — slice it, no storage read.
      return this.#log.slice(base + 1 - memLow);
    }

    // Client is further behind than the window reaches; pull the full range
    // from durable storage.
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

  async #touchPage() {
    const [title, body] = this.#pageText();
    await this.env.DB.prepare(
      "UPDATE pages SET title = ?2, body = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
    )
      .bind(this.name, title, body)
      .run();
  }

  #pageText(): [title: string, body: string] {
    const doc = schema.nodeFromJSON(this.#doc);
    const body = doc.textContent;
    const title = body.split(/\r?\n/, 1)[0]?.trim() || this.name;
    return [title, body];
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      routeApiRequest(request, env) ??
      (await routePartykitRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
