import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import {
  collab,
  collabKey,
  initCollabState,
  sendableCommit,
  receiveCommitTransaction,
  getVersion,
  Commit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { Step } from "prosemirror-transform";
import { PartySocket } from "partysocket";

import type {
  CommitJSON,
  NodeJSON,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { schema, SCHEMA_VERSION } from "../../shared/schema";
import type { ClientMessage, ServerMessage } from "../../worker/protocol";

import "prosemirror-view/style/prosemirror.css";

// --- Local cache (IndexedDB) -------------------------------------------------
// A best-effort offline cache of each room's latest doc, keyed by room. We
// restore from it on load so content paints before the server responds, and we
// keep the collab version alongside the doc so the catch-up sync after connect
// only has to replay the commits we actually missed.
const DB_NAME = "drafts";
const STORE = "docs";

interface CachedDoc {
  /** The confirmed (server-acknowledged) doc, at `version`. */
  doc: NodeJSON;
  /** The collab version (the strictly increasing counter) `doc` is at. */
  version: number;
  /**
   * Local steps the server hasn't confirmed yet, as step JSON, in order.
   * Re-applied on restore so in-flight edits survive a reload and still get
   * sent once we reconnect.
   */
  unconfirmed: unknown[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadCachedDoc(room: string): Promise<CachedDoc | null> {
  try {
    const db = await openDB();
    return await new Promise<CachedDoc | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(room);
      req.onsuccess = () => resolve((req.result as CachedDoc | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // no IndexedDB / private mode — just skip the cache
  }
}

async function saveCachedDoc(room: string, value: CachedDoc): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, room);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort; a failed write just means a colder reload next time
  }
}

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
}

const defaultHost = () =>
  import.meta.env.DEV ? "localhost:8787" : window.location.host;

/** The plugins every editor in the room shares, in order. */
const editorPlugins = () => [
  history(),
  keymap({ "Mod-z": undo, "Mod-y": redo, "Shift-Mod-z": redo }),
  keymap(baseKeymap),
  // Tracks the synced version + unconfirmed local steps. Seeded by
  // `initCollabState` once the server sends its snapshot.
  collab(),
];

export default function Doc(props: DocProps): JSX.Element {
  const [status, setStatus] = createSignal<DocStatus>("connecting");
  let mount!: HTMLDivElement;

  onMount(() => {
    let view: EditorView;
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

    const setDocStatus = (s: DocStatus) => {
      setStatus(s);
      props.onStatus?.(s);
    };

    // --- Local cache persistence -------------------------------------------
    // Set once the view is torn down, so a late IndexedDB load doesn't connect.
    let disposed = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Split the current editor state into the confirmed base doc + the
     * unconfirmed local steps. We reconstruct the confirmed doc by peeling the
     * unconfirmed steps back off the current doc (newest first); the collab
     * authority is seeded from that base, with the steps re-applied as local
     * edits. Returns null if the base can't be reconstructed, so we never cache
     * a doc that diverges from the version it claims to be at.
     */
    const snapshot = (): CachedDoc | null => {
      const unconfirmed = collabKey.getState(view.state)?.unconfirmed ?? [];
      let doc = view.state.doc;
      for (let i = unconfirmed.length - 1; i >= 0; i--) {
        const result = unconfirmed[i].inverted.apply(doc);
        if (!result.doc) return null;
        doc = result.doc;
      }
      return {
        doc: doc.toJSON(),
        version: getVersion(view.state) ?? 0,
        unconfirmed: unconfirmed.map((u) => u.step.toJSON()),
      };
    };

    /** Write the current doc + version + unconfirmed steps to the cache now. */
    const persist = () => {
      if (!initialized) return; // nothing meaningful to cache yet
      const snap = snapshot();
      // Fire-and-forget: the write is async and must not block the main thread.
      if (snap) void saveCachedDoc(props.room, snap);
    };

    /** Cache the current doc, debounced 3s after the last update. */
    const schedulePersist = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 3000);
    };

    const send = (msg: ClientMessage) => socket?.send(JSON.stringify(msg));

    /** Send the next pending commit, if we're allowed to right now. */
    const trySend = () => {
      if (halted || !initialized || inflightRef !== null) return;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const commit = sendableCommit(view.state);
      if (!commit) return;
      inflightRef = commit.ref;
      send({ type: "commit", commit: commit.toJSON() });
    };

    const halt = (reason: string) => {
      halted = true;
      view.setProps({ editable: () => false });
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
        view.updateState(
          view.state.apply(initCollabState(view.state, msg.version, msg.doc)),
        );
        initialized = true;
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
      const current = getVersion(view.state) ?? 0;
      if (msg.version > current) {
        resyncTarget = msg.version;
        setDocStatus("syncing");
        send({ type: "sync", version: current });
      } else {
        setDocStatus("connected");
        trySend();
      }
    };

    const handleCommit = (commitJSON: CommitJSON) => {
      const commit = Commit.FromJSON(view.state.schema, commitJSON);
      view.updateState(
        view.state.apply(receiveCommitTransaction(view.state, commit)),
      );

      // Our own commit came back — clear the gate so we can send the next one.
      if (inflightRef !== null && commit.ref === inflightRef) inflightRef = null;

      // Reconnect catch-up: once we've replayed up to the target, go live.
      if (resyncTarget !== null && (getVersion(view.state) ?? 0) >= resyncTarget) {
        resyncTarget = null;
        setDocStatus("connected");
      }

      schedulePersist();
      trySend();
    };

    const handleMessage = (raw: string) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw) as ServerMessage;
      } catch {
        return;
      }
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
    };

    // --- Editor view -------------------------------------------------------
    view = new EditorView(mount, {
      // Start empty + read-only; `init` seeds the real doc and enables editing.
      state: EditorState.create({ schema, plugins: editorPlugins() }),
      editable: () => initialized && !halted,
      dispatchTransaction(tr: Transaction) {
        view.updateState(view.state.apply(tr));
        if (tr.docChanged) schedulePersist();
        trySend();
      },
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

    // --- Restore from cache, then connect ----------------------------------
    // Seed the editor from the local cache before opening the socket, so the
    // last-known doc is visible and editable offline. Marking ourselves
    // `initialized` means the server's `init` takes handleInit's reconnect
    // path, which catches us up from the cached version instead of resetting.
    void loadCachedDoc(props.room).then((cached) => {
      if (disposed) return;
      if (cached && !initialized) {
        try {
          // Seed the confirmed authority state from the cached base...
          view.updateState(
            view.state.apply(
              initCollabState(view.state, cached.version, cached.doc),
            ),
          );
          // ...then replay the unconfirmed steps as local edits, so the collab
          // plugin tracks them as pending and trySend() ships them once we're
          // connected.
          if (cached.unconfirmed.length) {
            const tr = view.state.tr;
            for (const stepJSON of cached.unconfirmed) {
              tr.step(Step.fromJSON(view.state.schema, stepJSON));
            }
            if (tr.docChanged) view.updateState(view.state.apply(tr));
          }
          initialized = true;
        } catch (err) {
          // A malformed cache entry shouldn't block startup — fall back to the
          // server's snapshot via handleInit's first-seed path.
          console.warn(`[Doc:${props.room}] ignoring bad cache entry`, err);
          initialized = false;
        }
      }
      connect();
    });

    onCleanup(() => {
      disposed = true;
      if (saveTimer) clearTimeout(saveTimer);
      persist(); // flush the latest doc before unmount
      socket?.close();
      view.destroy();
    });
  });

  return <div ref={mount} class={props.class} data-doc-status={status()} />;
}
