import { Editor } from "@tiptap/core";
import {
  collabKey,
  initCollabState,
  sendableCommit,
  getVersion,
  Commit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { Step } from "prosemirror-transform";
import { PartySocket } from "partysocket";

import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { allExtensions } from "../../extensions";
import { emptyDocJSON, SCHEMA_VERSION } from "../../shared/schema";
import { displayTitle, pageTextFromDoc } from "../../shared/pageText";
import { serverMessageSchema, type ClientMessage, type PresencePeer, type ServerMessage } from "../../worker/protocol";
import { deleteCachedDoc, loadCachedDoc, saveCachedDoc, type CachedDoc } from "../stores/localDocs";
import { Collab, receiveRemoteCommitTransaction } from "./collabExtension";
import { mapRemotePresenceTransaction, presenceKey, Presence, setRemotePresenceTransaction } from "./presenceExtension";
import { addRemoteInsertGlow, RemoteInsertGlow } from "./remoteInsertGlowExtension";
import { DEFAULT_USERNAME } from "../stores/ui";

/** Connection lifecycle, surfaced for an optional status indicator. */
export type DocStatus = "connecting" | "connected" | "syncing" | "offline" | "halted";

export interface DraftSessionOptions {
  /** Document id — becomes the Durable Object room name. */
  room: string;
  /** Element TipTap should mount its editor view into. */
  mount: HTMLDivElement;
  /**
   * Worker host (`host:port`, no protocol). Defaults to the local
   * `wrangler dev` in dev and the current origin in production.
   */
  host?: string;
  /** Notified whenever the connection status changes. */
  onStatus?: (status: DocStatus) => void;
  /** Notified whenever the editor should be hidden or visible. */
  onReady?: (ready: boolean) => void;
  /**
   * Notified with the doc's display title and whether it has local changes
   * awaiting server confirmation.
   */
  onTitle?: (title: string, updatedAt?: string, hasUnconfirmedChanges?: boolean) => void;
  /** Current display name for this browser tab, persisted by the page shell. */
  getUsername?: () => string;
  /** Notified with the other live clients in this document. */
  onPresence?: (peers: PresencePeer[]) => void;
}

// The @cloudflare/vite-plugin runs the Worker + Durable Object inside the Vite
// dev server, so in dev the worker lives on the Vite origin too — same as prod.
const defaultHost = () => window.location.host;
const presenceColors = ["#0f766e", "#b45309", "#2563eb", "#be123c", "#6d28d9", "#15803d"];

function randomId(): string {
  if (crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2, 14);
}

function colorForClient(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0;
  }
  return presenceColors[Math.abs(hash) % presenceColors.length];
}

function cleanUsername(username: string | undefined): string {
  const cleaned = username?.trim().replace(/\s+/g, " ").slice(0, 80);
  return cleaned || DEFAULT_USERNAME;
}

export function startDraftSession(options: DraftSessionOptions): () => void {
  let editor: Editor;
  let socket: PartySocket | undefined;
  const clientId = randomId();
  const color = colorForClient(clientId);

  // True once we've seeded from the server's first snapshot.
  let initialized = false;
  // The ref of the commit currently awaiting confirmation, or null. The
  // protocol requires at most one outstanding commit per client.
  let inflightRef: string | null = null;
  // While catching up after a reconnect, the version we're replaying toward.
  let resyncTarget: number | null = null;
  // Set when we hit an unrecoverable condition (e.g. schema mismatch); we stop
  // sending rather than risk corrupting the document.
  let halted = false;
  // Last local-edit time, persisted as the cache's updatedAt. Seeded from the
  // restored cache (else now) and advanced only by genuine local edits.
  let lastModified = new Date().toISOString();
  let applyingCollab = false;

  // Set once the view is torn down, so a late IndexedDB load doesn't connect.
  let disposed = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let presenceTimer: ReturnType<typeof setTimeout> | undefined;
  let cacheWrite: Promise<void> = Promise.resolve();

  const dispatchCollab = (tr: Parameters<typeof editor.view.dispatch>[0]) => {
    applyingCollab = true;
    try {
      editor.view.dispatch(tr);
    } finally {
      applyingCollab = false;
    }
  };

  const setReady = (ready: boolean) => {
    options.onReady?.(ready);
  };

  const setDocStatus = (status: DocStatus) => {
    options.onStatus?.(status);
  };

  /**
   * Split the current editor state into the confirmed base doc + the
   * unconfirmed local steps. We reconstruct the confirmed doc by peeling the
   * unconfirmed steps back off the current doc (newest first); the collab
   * authority is seeded from that base, with the steps re-applied as local
   * edits.
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

  const persist = () => {
    if (!initialized || halted) return;
    const snap = snapshot();
    if (snap) {
      cacheWrite = cacheWrite.catch(() => undefined).then(() => saveCachedDoc(options.room, snap));
      void cacheWrite;
    }
  };

  const schedulePersist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 3000);
  };

  let lastTitle: string | undefined;
  let lastHasUnconfirmedChanges: boolean | undefined;
  const reportTitle = (force = false) => {
    if (!options.onTitle) return;
    const [title] = pageTextFromDoc(editor.state.doc, "Untitled");
    const next = displayTitle(title);
    const hasUnconfirmedChanges = hasUnconfirmedSteps();
    if (force || next !== lastTitle || hasUnconfirmedChanges !== lastHasUnconfirmedChanges) {
      lastTitle = next;
      lastHasUnconfirmedChanges = hasUnconfirmedChanges;
      options.onTitle(next, lastModified, hasUnconfirmedChanges);
    }
  };

  const hasUnconfirmedSteps = () => (collabKey.getState(editor.state)?.unconfirmed.length ?? 0) > 0;

  const send = (msg: ClientMessage) => socket?.send(JSON.stringify(msg));

  const currentPresence = (): PresencePeer => ({
    clientId,
    username: cleanUsername(options.getUsername?.()),
    color,
    version: getVersion(editor.state) ?? 0,
    selection: initialized
      ? {
          anchor: editor.state.selection.anchor,
          head: editor.state.selection.head,
        }
      : null,
  });

  const sendPresence = () => {
    if (halted || !socket || socket.readyState !== WebSocket.OPEN) return;
    send({ type: "presence", peer: currentPresence() });
  };

  const schedulePresence = () => {
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => {
      presenceTimer = undefined;
      sendPresence();
    }, 80);
  };

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
    if (saveTimer) clearTimeout(saveTimer);
    void deleteCachedDoc(options.room);
    editor.setEditable(false);
    setReady(true);
    setDocStatus("halted");
    console.error(`[Doc:${options.room}] halted — ${reason}`);
  };

  const resetToServerSnapshot = (version: number, doc: NodeJSON) => {
    dispatchCollab(initCollabState(editor.state, version, doc));
    editor.setEditable(!halted);
    setReady(true);
    setDocStatus("connected");
    schedulePersist();
    reportTitle(true);
    sendPresence();
    trySend();
  };

  const handleInit = (msg: Extract<ServerMessage, { type: "init" }>) => {
    if (msg.schemaVersion !== SCHEMA_VERSION) {
      halt(`schema mismatch (server ${msg.schemaVersion}, client ${SCHEMA_VERSION}) — reload to upgrade`);
      return;
    }

    if (!initialized) {
      initialized = true;
      resetToServerSnapshot(msg.version, msg.doc);
      return;
    }

    inflightRef = null;
    const current = getVersion(editor.state) ?? 0;
    if (msg.version > current) {
      if (resyncTarget !== null) {
        console.warn(
          `[Doc:${options.room}] server could not replay history from v${current}; resetting to snapshot v${msg.version}`,
        );
        resyncTarget = null;
        resetToServerSnapshot(msg.version, msg.doc);
        return;
      }
      resyncTarget = msg.version;
      setDocStatus("syncing");
      send({ type: "sync", version: current });
    } else if (msg.version < current) {
      console.warn(
        `[Doc:${options.room}] local state (v${current}) is ahead of server (v${msg.version}); resetting to server snapshot`,
      );
      resyncTarget = null;
      resetToServerSnapshot(msg.version, msg.doc);
    } else {
      setDocStatus("connected");
      reportTitle();
      sendPresence();
      trySend();
    }
  };

  const collaboratorColor = (remoteClientId: string | undefined): string | undefined => {
    if (!remoteClientId) return undefined;
    return presenceKey.getState(editor.state)?.peers.get(remoteClientId)?.color ?? colorForClient(remoteClientId);
  };

  const handleCommit = (msg: Extract<ServerMessage, { type: "commit" }>) => {
    const commit = Commit.FromJSON(editor.state.schema, msg.commit);
    const confirmedOwnCommit = inflightRef !== null && commit.ref === inflightRef;
    const shouldGlowRemoteInsert = !confirmedOwnCommit && resyncTarget === null;
    const tr = mapRemotePresenceTransaction(receiveRemoteCommitTransaction(editor.state, commit), commit.version);
    dispatchCollab(
      shouldGlowRemoteInsert ? addRemoteInsertGlow(tr, collaboratorColor(msg.clientId), commit.steps.length) : tr,
    );

    if (confirmedOwnCommit) inflightRef = null;

    if (resyncTarget !== null && (getVersion(editor.state) ?? 0) >= resyncTarget) {
      resyncTarget = null;
      setDocStatus("connected");
    }

    schedulePersist();
    reportTitle();
    if (confirmedOwnCommit) sendPresence();
    trySend();
  };

  const handlePresence = (peers: PresencePeer[]) => {
    const livePeers = peers.filter((peer) => peer.clientId !== clientId);
    options.onPresence?.(livePeers);
    dispatchCollab(
      setRemotePresenceTransaction(editor.state, peers, clientId, hasUnconfirmedSteps(), getVersion(editor.state) ?? 0),
    );
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
          handleCommit(msg);
          break;
        case "presence":
          handlePresence(msg.peers);
          break;
        case "error":
          if (msg.ref && msg.ref === inflightRef) {
            halt(`commit rejected: ${msg.message}`);
          } else {
            console.warn(`[Doc:${options.room}] server error: ${msg.message}`);
          }
          break;
      }
    } catch (err) {
      halt(`failed to apply server message: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  editor = new Editor({
    element: options.mount,
    extensions: [...allExtensions, Collab, Presence, RemoteInsertGlow],
    editable: false,
    content: "",
  });

  editor.on("transaction", ({ transaction }) => {
    if (transaction.docChanged) {
      const localEdit = !applyingCollab;
      if (localEdit) lastModified = new Date().toISOString();
      schedulePersist();
      reportTitle(localEdit);
    }
    if (!applyingCollab && transaction.selectionSet && !transaction.docChanged) {
      schedulePresence();
    }
    trySend();
  });

  const seedEmpty = () => {
    initialized = true;
    dispatchCollab(initCollabState(editor.state, 0, emptyDocJSON()));
    editor.setEditable(!halted);
    setReady(true);
    reportTitle(true);
    sendPresence();
    persist();
  };

  const connect = () => {
    if (disposed) return;
    socket = new PartySocket({
      host: options.host ?? defaultHost(),
      party: "document-server",
      room: options.room,
    });

    socket.addEventListener("open", () => {
      if (!initialized) setDocStatus("connecting");
      sendPresence();
    });
    socket.addEventListener("message", (e) => handleMessage(e.data as string));
    socket.addEventListener("close", () => {
      if (!halted) {
        if (!initialized) seedEmpty();
        setDocStatus("offline");
      }
    });
  };

  void loadCachedDoc(options.room).then((cached) => {
    if (disposed) return;
    if (!initialized) {
      try {
        if (cached && cached.schemaVersion !== SCHEMA_VERSION) {
          void deleteCachedDoc(options.room);
          cached = null;
        }
        if (cached) {
          initialized = true;
          if (cached.updatedAt) lastModified = cached.updatedAt;
          dispatchCollab(initCollabState(editor.state, cached.version, cached.doc));

          if (cached.unconfirmed.length) {
            const tr = editor.state.tr;
            for (const stepJSON of cached.unconfirmed) {
              tr.step(Step.fromJSON(editor.state.schema, stepJSON));
            }
            if (tr.docChanged) dispatchCollab(tr);
          }
          editor.setEditable(!halted);
          setReady(true);
          reportTitle(true);
          persist();
        } else {
          seedEmpty();
        }
      } catch (err) {
        console.warn(`[Doc:${options.room}] ignoring bad cache entry`, err);
        seedEmpty();
      }
    }
    connect();
  });

  window.addEventListener("drafts:username-change", sendPresence);

  return () => {
    disposed = true;
    if (saveTimer) clearTimeout(saveTimer);
    if (presenceTimer) clearTimeout(presenceTimer);
    window.removeEventListener("drafts:username-change", sendPresence);
    persist();
    socket?.close();
    editor.destroy();
  };
}
