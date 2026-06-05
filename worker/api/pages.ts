import type { Env } from "../index";
import { currentUserId } from "./session";

interface PageRow {
  page_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/pages — the page ids saved by the authenticated user, newest first.
 * Gated on the session JWT; unauthenticated callers get a 401 so the client can
 * distinguish "signed out" from "no drafts yet".
 */
export async function listPages(request: Request, env: Env): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { results } = await env.DB.prepare(
    `SELECT user_pages.page_id, pages.title, pages.body, user_pages.created_at, pages.updated_at
     FROM user_pages
     JOIN pages ON pages.id = user_pages.page_id
     WHERE user_pages.user_id = ?1
     ORDER BY pages.updated_at DESC`,
  )
    .bind(userId)
    .all<PageRow>();

  return Response.json({ pages: results });
}
