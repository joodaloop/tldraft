import type { Env } from "../index";

export type PageRelationship = "opened" | "creator";

interface PageCreatorRow {
  created_by: string | null;
}

export async function ensurePageRow(
  env: Env,
  pageId: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO pages (id, title, body) VALUES (?1, 'Untitled', '')",
  )
    .bind(pageId)
    .run();
}

/**
 * Link a page to a user without downgrading a stronger existing relationship.
 *
 * Precedence is: creator > opened. That way opening a page never downgrades a
 * creator row.
 */
export async function linkUserToPage(
  env: Env,
  userId: string,
  pageId: string,
  relationship: PageRelationship,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_pages (user_id, page_id, relationship)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id, page_id) DO UPDATE SET
       relationship = CASE
         WHEN user_pages.relationship = 'creator' THEN 'creator'
         WHEN excluded.relationship = 'creator' THEN 'creator'
         ELSE 'opened'
       END`,
  )
    .bind(userId, pageId, relationship)
    .run();
}

/**
 * If the page is unclaimed, make this user its creator. Returns whether this
 * user should be treated as the creator after the operation.
 */
export async function claimPageCreator(
  env: Env,
  userId: string,
  pageId: string,
): Promise<boolean> {
  const { meta } = await env.DB.prepare(
    "UPDATE pages SET created_by = ?1 WHERE id = ?2 AND created_by IS NULL",
  )
    .bind(userId, pageId)
    .run();

  if (meta.changes) return true;

  const row = await env.DB.prepare("SELECT created_by FROM pages WHERE id = ?1")
    .bind(pageId)
    .first<PageCreatorRow>();
  return row?.created_by === userId;
}

export async function recordPageOpen(
  env: Env,
  userId: string,
  pageId: string,
): Promise<void> {
  const isCreator = await claimPageCreator(env, userId, pageId);
  await linkUserToPage(env, userId, pageId, isCreator ? "creator" : "opened");
}

export async function addPageForUser(
  env: Env,
  userId: string,
  pageId: string,
): Promise<void> {
  await ensurePageRow(env, pageId);
  await recordPageOpen(env, userId, pageId);
}
