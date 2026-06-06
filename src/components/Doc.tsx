import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Editor } from "@tiptap/core";
import {
  collabKey,
  initCollabState,
  sendableCommit,
  receiveCommitTransaction,
  getVersion,
  Commit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { Step } from "prosemirror-transform";
import { PartySocket } from "partysocket";

import type { CommitJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { allExtensions } from "../../extensions";
import { Collab } from "./collabExtension";
import { emptyDocJSON, SCHEMA_VERSION } from "../../shared/schema";
import { pageTextFromDoc } from "../../shared/pageText";
import {
  serverMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from "../../worker/protocol";
import {
  deleteCachedDoc,
  loadCachedDoc,
  saveCachedDoc,
  type CachedDoc,
} from "../stores/localDocs";

import "prosemirror-view/style/prosemirror.css";

/** Connection lifecycle, surfaced for an optional status indicator. */
export type DocStatus =
  | "connecting"
  | "connected"
  | "syncing"
  | "offline"
  | "halted";

export interface DocProps {
  /** Document id — becomes the Durable Object room name. */
  room: string;
  /**
   * Worker host (`host:port`, no protocol). Defaults to the local
   * `wrangler dev` in dev and the current origin in production.
   */
  host?: string;
  class?: string;
  /** Notified whenever the connection status changes. */
  onStatus?: (status: DocStatus) => void;
  /**
   * Notified with the doc's display title (its first non-empty line, or
   * "Untitled") on seed and whenever it changes — lets the sidebar list this
   * draft live, before it's ever saved.
   */
  onTitle?: (title: string, updatedAt?: string) => void;
}

// The @cloudflare/vite-plugin runs the Worker + Durable Object inside the Vite
// dev server, so in dev the worker lives on the Vite origin too — same as prod.
const defaultHost = () => window.location.host;

export default function Doc(props: DocProps): JSX.Element {
  const [status, setStatus] = createSignal<DocStatus>("connecting");
  let mount!: HTMLDivElement;

  onMount(() => {
    let editor: Editor;
    let socket: PartySocket | undefined;

    // --- Collab controller state -------------------------------------------
    // True once we've seeded from the server's first snapshot.
    let initialized = false;
    // The ref of the commit currently awaiting confirmation, or null. The
    // protocol requires at most one outstanding commit per client.
    let inflightRef: string | null = null;
    // While catching up after a reconnect, the version we're replaying toward.
    let resyncTarget: number | null = null;
    // Set when we hit an unrecoverable condition (e.g. schema mismatch); we
    // stop sending rather than risk corrupting the document.
    let halted = false;
    // Last local-edit time, persisted as the cache's updatedAt. Seeded from the
    // restored cache (else now) and advanced only by genuine local edits — the
    // `applyingCollab` guard keeps seed/restore/remote-apply dispatches from
    // bumping it.
    let lastModified = new Date().toISOString();
    let applyingCollab = false;

    // Dispatch a collab-authority transaction (seed/restore/remote-apply)
    // without it counting as a local edit for `lastModified`.
    const dispatchCollab = (tr: Parameters<typeof editor.view.dispatch>[0]) => {
      applyingCollab = true;
      try {
        editor.view.dispatch(tr);
      } finally {
        applyingCollab = false;
      }
    };

    const setDocStatus = (s: DocStatus) => {
      setStatus(s);
      props.onStatus?.(s);
    };

    // --- Local cache persistence -------------------------------------------
    // Set once the view is torn down, so a late IndexedDB load doesn't connect.
    let disposed = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let cacheWrite: Promise<void> = Promise.resolve();

    /**
     * Split the current editor state into the confirmed base doc + the
     * unconfirmed local steps. We reconstruct the confirmed doc by peeling the
     * unconfirmed steps back off the current doc (newest first); the collab
     * authority is seeded from that base, with the steps re-applied as local
     * edits. Returns null if the base can't be reconstructed, so we never cache
     * a doc that diverges from the version it claims to be at.
     */
    const snapshot = (): CachedDoc | null => {
      const unconfirmed = collabKey.getState(editor.state)?.unconfirmed ?? [];
      let doc = editor.state.doc;
      for (let i = unconfirmed.length - 1; i >= 0; i--) {
        const result = unconfirmed[i].inverted.apply(doc);
        if (!result.doc) return null;
        doc = result.doc;
      }
      return {
        schemaVersion: SCHEMA_VERSION,
        doc: doc.toJSON(),
        version: getVersion(editor.state) ?? 0,
        unconfirmed: unconfirmed.map((u) => u.step.toJSON()),
        updatedAt: lastModified,
      };
    };

    /** Write the current doc + version + unconfirmed steps to the cache now. */
    const persist = () => {
      // Nothing meaningful to cache before seeding; and once halted we've
      // dropped the cache on purpose — don't let a debounced write resurrect it.
      if (!initialized || halted) return;
      const snap = snapshot();
      // Fire-and-forget, but serialize writes so an older IndexedDB transaction
      // can't finish after a newer snapshot and overwrite it.
      if (snap) {
        cacheWrite = cacheWrite
          .catch(() => undefined)
          .then(() => saveCachedDoc(props.room, snap));
        void cacheWrite;
      }
    };

    /** Cache the current doc, debounced 3s after the last update. */
    const schedulePersist = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 3000);
    };

    // Report the doc's title (first non-empty line, else "Untitled") to the
    // parent. Local edits force a report so the sidebar's modified sort updates
    // even when the title itself is unchanged.
    let lastTitle: string | undefined;
    const reportTitle = (force = false) => {
      if (!props.onTitle) return;
      const [title] = pageTextFromDoc(editor.state.doc, "Untitled");
      const next = title.slice(0, 80);
      if (force || next !== lastTitle) {
        lastTitle = next;
        props.onTitle(next, lastModified);
      }
    };

    const send = (msg: ClientMessage) => socket?.send(JSON.stringify(msg));

    /** Send the next pending commit, if we're allowed to right now. */
    const trySend = () => {
      if (halted || !initialized || inflightRef !== null) return;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const commit = sendableCommit(editor.state);
      if (!commit) return;
      inflightRef = commit.ref;
      send({ type: "commit", commit: commit.toJSON() });
    };

    const halt = (reason: string) => {
      halted = true;
      // Drop the local cache: whatever we have is what got us halted (a stale
      // schema, or edits the server rejected). Keeping it would re-seed the
      // same broken state on reload and halt again — clearing it lets a reload
      // re-seed cleanly from the server authority.
      if (saveTimer) clearTimeout(saveTimer);
      void deleteCachedDoc(props.room);
      editor.setEditable(false);
      setDocStatus("halted");
      console.error(`[Doc:${props.room}] halted — ${reason}`);
    };

    const handleInit = (msg: Extract<ServerMessage, { type: "init" }>) => {
      if (msg.schemaVersion !== SCHEMA_VERSION) {
        halt(
          `schema mismatch (server ${msg.schemaVersion}, client ${SCHEMA_VERSION}) — reload to upgrade`,
        );
        return;
      }

      if (!initialized) {
        // First snapshot: seed the collab plugin with the server's doc+version.
        // Set `initialized` before updateState so `editable` is re-read as true.
        initialized = true;
        dispatchCollab(
          initCollabState(editor.state, msg.version, msg.doc),
        );
        editor.setEditable(!halted);
        setDocStatus("connected");
        schedulePersist();
        trySend();
        return;
      }

      // Reconnect. Keep our local (possibly unconfirmed) edits and catch up by
      // replaying the commits we missed rather than resetting to the snapshot.
      // Whatever we had in flight may or may not have landed; we'll resubmit
      // after the catch-up, and a duplicate is harmless (matched by ref).
      inflightRef = null;
      const current = getVersion(editor.state) ?? 0;
      if (msg.version > current) {
        if (resyncTarget !== null) {
          console.warn(
            `[Doc:${props.room}] server could not replay history from v${current}; resetting to snapshot v${msg.version}`,
          );
          resyncTarget = null;
          dispatchCollab(
            initCollabState(editor.state, msg.version, msg.doc),
          );
          editor.setEditable(!halted);
          setDocStatus("connected");
          schedulePersist();
          trySend();
          return;
        }
        resyncTarget = msg.version;
        setDocStatus("syncing");
        send({ type: "sync", version: current });
      } else if (msg.version < current) {
        // We're ahead of the authority. The only way this happens is the server
        // lost history (reset/rollback) — our cached version and pending edits
        // are built on commits it no longer has, so they can't be replayed and
        // resubmitting them would just get rejected (and, with the cache, that
        // rejection would survive reloads). Hard-reset to the server's snapshot
        // and overwrite the stale cache. Unconfirmed edits past the server's
        // version are unrecoverable and dropped.
        console.warn(
          `[Doc:${props.room}] local state (v${current}) is ahead of server (v${msg.version}); resetting to server snapshot`,
        );
        resyncTarget = null;
        dispatchCollab(
          initCollabState(editor.state, msg.version, msg.doc),
        );
        editor.setEditable(!halted);
        setDocStatus("connected");
        schedulePersist();
        trySend();
      } else {
        setDocStatus("connected");
        trySend();
      }
    };

    const handleCommit = (commitJSON: CommitJSON) => {
      const commit = Commit.FromJSON(editor.state.schema, commitJSON);
      dispatchCollab(receiveCommitTransaction(editor.state, commit));

      // Our own commit came back — clear the gate so we can send the next one.
      if (inflightRef !== null && commit.ref === inflightRef) inflightRef = null;

      // Reconnect catch-up: once we've replayed up to the target, go live.
      if (resyncTarget !== null && (getVersion(editor.state) ?? 0) >= resyncTarget) {
        resyncTarget = null;
        setDocStatus("connected");
      }

      schedulePersist();
      trySend();
    };

    const handleMessage = (raw: string) => {
      let msg: ServerMessage;
      try {
        const parsed = serverMessageSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          halt("server sent an invalid message");
          return;
        }
        msg = parsed.data;
      } catch {
        return;
      }
      try {
        switch (msg.type) {
          case "init":
            handleInit(msg);
            break;
          case "commit":
            handleCommit(msg.commit);
            break;
          case "error":
            // A rejected commit (bad base version or invalid against the schema).
            // We can't safely retry the same steps, so stop sending and surface
            // it. A reload re-seeds from the authority.
            if (msg.ref && msg.ref === inflightRef) {
              halt(`commit rejected: ${msg.message}`);
            } else {
              console.warn(`[Doc:${props.room}] server error: ${msg.message}`);
            }
            break;
        }
      } catch (err) {
        halt(`failed to apply server message: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    // --- Editor ------------------------------------------------------------
    // Tiptap owns the EditorView; the collab authority plugin is folded in via
    // the `Collab` extension. Starts non-editable and empty; we seed the collab
    // state locally (from cache, else an empty doc) before connecting, then flip
    // editable on. `halted` (schema mismatch) is the one hard stop.
    editor = new Editor({
      element: mount,
      extensions: [...allExtensions, Collab],
      editable: false,
      content: "",
    });
    // The post-transaction work the old `dispatchTransaction` did: persist on
    // doc changes and ship the next pending commit. Fires for local edits and
    // for the collab transactions we dispatch below alike.
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) {
        const localEdit = !applyingCollab;
        if (localEdit) lastModified = new Date().toISOString();
        schedulePersist();
        reportTitle(localEdit);
      }
      trySend();
    });

    // --- Socket ------------------------------------------------------------
    const connect = () => {
      if (disposed) return;
      socket = new PartySocket({
        host: props.host ?? defaultHost(),
        party: "document-server", // kebab-case of the DocumentServer binding
        room: props.room,
      });

      socket.addEventListener("open", () => {
        if (!initialized) setDocStatus("connecting");
        // On (re)connect the server sends `init`; handleInit drives catch-up.
      });
      socket.addEventListener("message", (e) => handleMessage(e.data as string));
      socket.addEventListener("close", () => {
        if (!halted) setDocStatus("offline");
      });
    };

    // --- Restore (local-first), then connect -------------------------------
    // Seed the collab state locally before opening the socket so the editor is
    // editable immediately, online or off. The server's version-0 base is an
    // empty doc (see worker/index.ts), so seeding empty here is a consistent
    // starting point: `init` then takes handleInit's reconnect path and
    // replays the commits we're missing on top of it.
    // Note: flip `initialized` before the seeding updateState — ProseMirror
    // re-reads the `editable` prop during updateState, so it must already be
    // true or the editor stays contenteditable=false until the next update.
    const seedEmpty = () => {
      initialized = true;
      dispatchCollab(initCollabState(editor.state, 0, emptyDocJSON()));
      editor.setEditable(!halted);
    };

    void loadCachedDoc(props.room).then((cached) => {
      if (disposed) return;
      if (!initialized) {
        try {
          // Ignore a cache written under a different schema — seeding it into the
          // current schema would corrupt or throw. The reconnect sync re-seeds
          // us from the server's snapshot instead.
          if (cached && cached.schemaVersion !== SCHEMA_VERSION) {
            void deleteCachedDoc(props.room);
            cached = null;
          }
          if (cached) {
            initialized = true;
            // Restore the prior session's last-edit time so we don't reset
            // "modified" to now just by reopening the draft.
            if (cached.updatedAt) lastModified = cached.updatedAt;
            // Seed the confirmed authority state from the cached base...
            dispatchCollab(
              initCollabState(editor.state, cached.version, cached.doc),
            );
            // ...then replay the unconfirmed steps as local edits, so the
            // collab plugin tracks them as pending and trySend() ships them
            // once we're connected.
            if (cached.unconfirmed.length) {
              const tr = editor.state.tr;
              for (const stepJSON of cached.unconfirmed) {
                tr.step(Step.fromJSON(editor.state.schema, stepJSON));
              }
              if (tr.docChanged) dispatchCollab(tr);
            }
            editor.setEditable(!halted);
          } else {
            seedEmpty();
          }
        } catch (err) {
          // A malformed cache entry shouldn't block editing — seed empty and
          // let the reconnect sync bring us up to the server's state.
          console.warn(`[Doc:${props.room}] ignoring bad cache entry`, err);
          seedEmpty();
        }
      }
      connect();
    });

    onCleanup(() => {
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      persist(); // flush the latest doc before unmount
      socket?.close();
      editor.destroy();
    });
  });

  return <div ref={mount} class={props.class} data-doc-status={status()} />;
}
