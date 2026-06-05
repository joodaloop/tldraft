import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

interface NodeJSONWithContent extends NodeJSON {
  text?: unknown;
  content?: unknown;
}

export function plainTextFromDoc(doc: ProseMirrorNode): string {
  return doc.textBetween(0, doc.content.size, "\n");
}

export function pageTextFromDoc(
  doc: ProseMirrorNode,
  fallbackTitle: string,
): [title: string, body: string] {
  const body = plainTextFromDoc(doc);
  const title = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? fallbackTitle;

  return [title, body];
}

function nodeTextFromJSON(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as NodeJSONWithContent;
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(nodeTextFromJSON).join("");
  return "";
}

export function pageTitleFromDocJSON(doc: NodeJSON, fallbackTitle: string): string {
  const content = (doc as NodeJSONWithContent).content;
  if (!Array.isArray(content)) return fallbackTitle;

  for (const block of content) {
    const title = nodeTextFromJSON(block).trim();
    if (title) return title;
  }
  return fallbackTitle;
}
