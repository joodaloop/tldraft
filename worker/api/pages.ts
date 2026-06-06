import type { Env } from "../index";
import { currentUserId } from "./session";

interface PageRow {
  page_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  pinned_at: string | null;
  relationship: string;
}

/**
 * GET /api/pages — the pages saved by the authenticated user: pinned drafts
 * first (most-recently-pinned first), then the rest newest-first. Gated on the
 * session JWT; unauthenticated callers get a 401 so the client can distinguish
 * "signed out" from "no drafts yet".
 */
export async function listPages(request: Request, env: Env): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { results } = await env.DB.prepare(
    `SELECT user_pages.page_id, pages.title, pages.body,
            user_pages.created_at, pages.updated_at, user_pages.pinned_at,
            user_pages.relationship
     FROM user_pages
     JOIN pages ON pages.id = user_pages.page_id
     WHERE user_pages.user_id = ?1
     ORDER BY user_pages.pinned_at IS NULL, user_pages.pinned_at DESC, pages.updated_at DESC`,
  )
    .bind(userId)
    .all<PageRow>();

  return Response.json({ pages: results });
}
