import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import type { Node as ProseMirrorNode } from "prosemirror-model";

const GLOW_DURATION_MS = 5000;

interface GlowRange {
  from: number;
  to: number;
}

interface GlowState {
  decorations: DecorationSet;
}

type GlowMeta =
  | {
      type: "add";
      ranges: GlowRange[];
      now: number;
      color?: string;
    }
  | {
      type: "cleanup";
      now: number;
    };

export const remoteInsertGlowKey = new PluginKey<GlowState>("remoteInsertGlow");

function clampPos(doc: ProseMirrorNode, pos: number): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

function insertedRangesFromTransaction(tr: Transaction): GlowRange[] {
  const ranges: GlowRange[] = [];

  tr.mapping.maps.forEach((map) => {
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (oldStart !== oldEnd || newEnd <= newStart) return;
      ranges.push({
        from: clampPos(tr.doc, newStart),
        to: clampPos(tr.doc, newEnd),
      });
    });
  });

  return ranges.filter((range) => range.from < range.to);
}

function removeExpired(decorations: DecorationSet, now: number): DecorationSet {
  const expired = decorations.find(undefined, undefined, (spec) => {
    return typeof spec.expiresAt === "number" && spec.expiresAt <= now;
  });
  return expired.length ? decorations.remove(expired) : decorations;
}

function nextExpiry(state: EditorState): number | null {
  const pluginState = remoteInsertGlowKey.getState(state);
  if (!pluginState) return null;

  let next: number | null = null;
  for (const decoration of pluginState.decorations.find()) {
    const expiresAt = decoration.spec.expiresAt;
    if (typeof expiresAt !== "number") continue;
    next = next === null ? expiresAt : Math.min(next, expiresAt);
  }
  return next;
}

function scheduleCleanup(view: EditorView, currentTimer: ReturnType<typeof setTimeout> | undefined): ReturnType<typeof setTimeout> | undefined {
  if (currentTimer) clearTimeout(currentTimer);

  const expiresAt = nextExpiry(view.state);
  if (expiresAt === null) return undefined;

  const delay = Math.max(0, expiresAt - Date.now());
  return setTimeout(() => {
    view.dispatch(
      view.state.tr.setMeta(remoteInsertGlowKey, {
        type: "cleanup",
        now: Date.now(),
      } satisfies GlowMeta),
    );
  }, delay);
}

export function addRemoteInsertGlow(tr: Transaction, color?: string): Transaction {
  const ranges = insertedRangesFromTransaction(tr);
  if (!ranges.length) return tr;

  return tr.setMeta(remoteInsertGlowKey, {
    type: "add",
    ranges,
    now: Date.now(),
    color,
  } satisfies GlowMeta);
}

export const RemoteInsertGlow = Extension.create({
  name: "remoteInsertGlow",

  addProseMirrorPlugins() {
    return [
      new Plugin<GlowState>({
        key: remoteInsertGlowKey,
        state: {
          init: (_, state) => ({
            decorations: DecorationSet.create(state.doc, []),
          }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(remoteInsertGlowKey) as GlowMeta | undefined;
            let decorations = tr.docChanged ? prev.decorations.map(tr.mapping, tr.doc) : prev.decorations;
            decorations = removeExpired(decorations, meta?.now ?? Date.now());

            if (meta?.type === "add") {
              const expiresAt = meta.now + GLOW_DURATION_MS;
              const additions = meta.ranges
                .map((range) => ({
                  from: clampPos(tr.doc, range.from),
                  to: clampPos(tr.doc, range.to),
                }))
                .filter((range) => range.from < range.to)
                .map((range) => {
                  const attrs = meta.color
                    ? {
                        class: "remote-insert-glow",
                        style: `--remote-insert-color: ${meta.color};`,
                      }
                    : { class: "remote-insert-glow" };
                  return Decoration.inline(range.from, range.to, attrs, { expiresAt });
                });
              decorations = additions.length ? decorations.add(tr.doc, additions) : decorations;
            }

            return { decorations };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations;
          },
        },
        view(view) {
          let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
          cleanupTimer = scheduleCleanup(view, cleanupTimer);

          return {
            update(updatedView) {
              cleanupTimer = scheduleCleanup(updatedView, cleanupTimer);
            },
            destroy() {
              if (cleanupTimer) clearTimeout(cleanupTimer);
            },
          };
        },
      }),
    ];
  },
});
