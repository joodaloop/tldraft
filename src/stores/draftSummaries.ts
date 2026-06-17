export type {
  DraftRelationship,
  DraftSummary,
  LocalDraftRow,
  ServerDraftRow,
} from "./draftSchemas";

import type { DraftSummary, LocalDraftRow, ServerDraftRow } from "./draftSchemas";
import { displayTitle } from "../../shared/pageText";

function usableTitle(title: string | undefined): string | undefined {
  const titleText = displayTitle(title);
  return titleText !== "Untitled" ? titleText : undefined;
}

function isPlaceholderServerTitle(page: ServerDraftRow): boolean {
  const title = page.title?.trim();
  return !title || title === "Untitled" || title === page.page_id;
}

function draftSummaryTitle(
  page: ServerDraftRow,
  local: LocalDraftRow | undefined,
  cached: ServerDraftRow | undefined,
): string {
  const localUpdated = local?.updated_at;
  const localIsCurrent =
    !!local?.hasUnconfirmedChanges ||
    (localUpdated !== undefined && localUpdated >= (page.updated_at ?? ""));

  if (localIsCurrent && local?.title !== undefined) {
    return displayTitle(local.title);
  }

  if (isPlaceholderServerTitle(page)) {
    return (
      usableTitle(local?.title) ??
      usableTitle(cached?.title) ??
      "Untitled"
    );
  }

  return usableTitle(local?.title) ?? displayTitle(page.title);
}

function mergeUpdatedAt(server: ServerDraftRow, local: LocalDraftRow | undefined): string | undefined {
  if (local?.updated_at && local.updated_at > (server.updated_at ?? "")) {
    return local.updated_at;
  }
  return server.updated_at;
}

export function buildDraftSummaries(
  serverRows: ServerDraftRow[],
  localRows: LocalDraftRow[],
  cachedRows: ServerDraftRow[] = [],
): DraftSummary[] {
  const localById = new Map(localRows.map((p) => [p.page_id, p]));
  const cachedById = new Map(cachedRows.map((p) => [p.page_id, p]));
  const byId = new Map<string, DraftSummary>();

  for (const server of serverRows) {
    const local = localById.get(server.page_id);
    byId.set(server.page_id, {
      id: server.page_id,
      page_id: server.page_id,
      created_at: server.created_at,
      updated_at: mergeUpdatedAt(server, local),
      relationship: server.relationship,
      title: draftSummaryTitle(server, local, cachedById.get(server.page_id)),
      hasUnconfirmedChanges: local?.hasUnconfirmedChanges ?? false,
      source: local ? "merged" : "server",
    });
  }

  for (const local of localRows) {
    if (byId.has(local.page_id)) continue;
    byId.set(local.page_id, {
      id: local.page_id,
      page_id: local.page_id,
      created_at: local.created_at,
      updated_at: local.updated_at,
      title: displayTitle(local.title),
      hasUnconfirmedChanges: local.hasUnconfirmedChanges ?? false,
      source: "local",
    });
  }

  return [...byId.values()];
}

export function serverSummaries(summaries: DraftSummary[]): ServerDraftRow[] {
  return summaries
    .filter((summary) => summary.relationship)
    .map((summary) => ({
      page_id: summary.page_id,
      created_at: summary.created_at,
      updated_at: summary.updated_at,
      title: summary.title,
      relationship: summary.relationship,
    }));
}
