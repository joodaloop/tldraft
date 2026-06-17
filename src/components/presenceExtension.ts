import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet } from "prosemirror-view";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";

import type { PresencePeer } from "../../worker/protocol";

export const presenceKey = new PluginKey<PresenceState>("presence");

export interface MappablePresencePosition {
  pos: number;
  version: number;
}

export interface MappablePresenceSelection {
  anchor: MappablePresencePosition;
  head: MappablePresencePosition;
}

export interface MappablePresencePeer {
  clientId: string;
  username: string;
  color: string;
  selection: MappablePresenceSelection | null;
}

export interface PresenceState {
  peers: Map<string, MappablePresencePeer>;
  decorations: DecorationSet;
}

type PresenceMeta =
  | {
      type: "set";
      peers: PresencePeer[];
      ownClientId: string;
      preserveExisting: boolean;
      docVersion: number;
    }
  | {
      type: "map";
      version: number;
    };

function clampPos(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function endpoint(pos: number, version: number): MappablePresencePosition {
  return { pos, version };
}

function fromWirePeer(peer: PresencePeer, doc: ProseMirrorNode): MappablePresencePeer {
  return {
    clientId: peer.clientId,
    username: peer.username,
    color: peer.color,
    selection: peer.selection
      ? {
          anchor: endpoint(clampPos(doc, peer.selection.anchor), peer.version),
          head: endpoint(clampPos(doc, peer.selection.head), peer.version),
        }
      : null,
  };
}

function selectionVersion(selection: MappablePresenceSelection | null): number {
  if (!selection) return 0;
  return Math.min(selection.anchor.version, selection.head.version);
}

function shouldKeepExistingPeer(
  existing: MappablePresencePeer | undefined,
  incoming: PresencePeer,
  preserveExisting: boolean,
  docVersion: number,
): boolean {
  if (!existing) return false;
  if (incoming.version > docVersion) return true;

  const existingVersion = selectionVersion(existing.selection);
  if (existingVersion > incoming.version) return true;
  return preserveExisting && existingVersion >= incoming.version;
}

function mapPresencePosition(
  position: MappablePresencePosition,
  tr: Transaction,
  assoc: -1 | 1,
  version?: number,
): MappablePresencePosition {
  return {
    pos: tr.docChanged ? clampPos(tr.doc, tr.mapping.map(position.pos, assoc)) : position.pos,
    version: version ?? position.version,
  };
}

function mapPresenceSelection(
  selection: MappablePresenceSelection | null,
  tr: Transaction,
  version?: number,
): MappablePresenceSelection | null {
  if (!selection) return null;

  if (selection.anchor.pos === selection.head.pos) {
    const pos = mapPresencePosition(selection.head, tr, 1, version);
    return { anchor: pos, head: pos };
  }

  return {
    anchor: mapPresencePosition(selection.anchor, tr, -1, version),
    head: mapPresencePosition(selection.head, tr, 1, version),
  };
}

function mapPresencePeer(
  peer: MappablePresencePeer,
  tr: Transaction,
  version?: number,
): MappablePresencePeer {
  return {
    ...peer,
    selection: mapPresenceSelection(peer.selection, tr, version),
  };
}

function buildDecorations(doc: ProseMirrorNode, peers: Map<string, MappablePresencePeer>): DecorationSet {
  const decorations: Decoration[] = [];

  for (const peer of peers.values()) {
    if (!peer.selection) continue;

    const anchor = clampPos(doc, peer.selection.anchor.pos);
    const head = clampPos(doc, peer.selection.head.pos);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const label = peer.username;

    if (from !== to) {
      decorations.push(
        Decoration.inline(from, to, {
          class: "remote-selection",
          style: `background-color: ${peer.color}33;`,
        }),
      );
    }

    decorations.push(
      Decoration.widget(
        head,
        () => {
          const cursor = document.createElement("span");
          cursor.className = "remote-cursor";
          cursor.style.setProperty("--remote-cursor-color", peer.color);
          cursor.setAttribute("data-username", label);
          cursor.setAttribute("title", label);
          return cursor;
        },
        { key: `cursor-${peer.clientId}` },
      ),
    );
  }

  return DecorationSet.create(doc, decorations);
}

function nextPresenceState(
  prev: PresenceState,
  tr: Transaction,
  meta: PresenceMeta | undefined,
): PresenceState {
  const peers = new Map<string, MappablePresencePeer>();

  if (meta?.type === "set") {
    for (const peer of meta.peers) {
      const existing = prev.peers.get(peer.clientId);
      if (peer.clientId === meta.ownClientId) continue;
      if (peer.version <= meta.docVersion) {
        peers.set(peer.clientId, fromWirePeer(peer, tr.doc));
      }
      if (!existing || peer.clientId === meta.ownClientId) continue;
      if (shouldKeepExistingPeer(existing, peer, meta.preserveExisting, meta.docVersion)) {
        peers.set(peer.clientId, existing);
      }
    }
  } else {
    for (const [clientId, peer] of prev.peers) {
      peers.set(clientId, mapPresencePeer(peer, tr, meta?.type === "map" ? meta.version : undefined));
    }
  }

  return {
    peers,
    decorations: buildDecorations(tr.doc, peers),
  };
}

export function setRemotePresenceTransaction(
  state: EditorState,
  peers: PresencePeer[],
  ownClientId: string,
  preserveExisting: boolean,
  docVersion: number,
): Transaction {
  return state.tr.setMeta(presenceKey, {
    type: "set",
    peers,
    ownClientId,
    preserveExisting,
    docVersion,
  } satisfies PresenceMeta);
}

export function mapRemotePresenceTransaction(tr: Transaction, version: number): Transaction {
  return tr.setMeta(presenceKey, {
    type: "map",
    version,
  } satisfies PresenceMeta);
}

export function presencePlugin(): Plugin<PresenceState> {
  return new Plugin<PresenceState>({
    key: presenceKey,
    state: {
      init(_, state) {
        return {
          peers: new Map(),
          decorations: buildDecorations(state.doc, new Map()),
        };
      },
      apply(tr, value) {
        return nextPresenceState(value, tr, tr.getMeta(presenceKey));
      },
    },
    props: {
      decorations(state) {
        return presenceKey.getState(state)?.decorations ?? null;
      },
    },
  });
}

export const Presence = Extension.create({
  name: "presence",
  addProseMirrorPlugins() {
    return [presencePlugin()];
  },
});
