import type { Env } from "../index";
import jwt from "@tsndr/cloudflare-worker-jwt";
import { currentUserId } from "./session";
import { listPages } from "./pages";

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

interface UserRow {
  id: string;
  google_sub: string | null;
  email: string;
}

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}

function errorResponse(message: string, status = 500): Response {
  return new Response(`Authentication Failed: ${message}`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function loginCallbackUrl(request: Request): string {
  return new URL("/api/login/callback", request.url).toString();
}

function startGoogleLogin(request: Request, env: Env): Response {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: loginCallbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function exchangeCode(request: Request, env: Env, code: string): Promise<string> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: loginCallbackUrl(request),
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokenData = await tokenResponse.json<{
    access_token?: string;
    error?: string;
    error_description?: string;
  }>();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "failed to exchange code");
  }
  return tokenData.access_token;
}

async function fetchGoogleUser(accessToken: string): Promise<GoogleUserInfo> {
  const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!userResponse.ok) throw new Error("failed to fetch user profile from Google");
  const user = await userResponse.json<GoogleUserInfo>();
  if (!user.id || !user.email) throw new Error("Google profile is missing id or email");
  if (user.verified_email === false) throw new Error("Google email is not verified");
  return user;
}

async function findOrCreateUser(env: Env, googleUser: GoogleUserInfo): Promise<UserRow> {
  const existing = await env.DB.prepare(
    "SELECT id, google_sub, email FROM users WHERE google_sub = ?1 OR email = ?2 LIMIT 1",
  )
    .bind(googleUser.id, googleUser.email)
    .first<UserRow>();

  if (existing) {
    if (!existing.google_sub) {
      await env.DB.prepare(
        "UPDATE users SET google_sub = ?1, name = ?2, avatar_url = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?4",
      )
        .bind(googleUser.id, googleUser.name ?? googleUser.given_name ?? null, googleUser.picture ?? null, existing.id)
        .run();
      return { ...existing, google_sub: googleUser.id };
    }
    return existing;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id, google_sub, email, name, avatar_url) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(id, googleUser.id, googleUser.email, googleUser.name ?? googleUser.given_name ?? null, googleUser.picture ?? null)
    .run();
  return { id, google_sub: googleUser.id, email: googleUser.email };
}

async function finishGoogleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const googleError = url.searchParams.get("error");
  if (googleError) throw new Error(`Google OAuth Provider Error: ${googleError}`);

  const code = url.searchParams.get("code");
  if (!code) throw new Error("No authorization code found in request.");

  const accessToken = await exchangeCode(request, env, code);
  const googleUser = await fetchGoogleUser(accessToken);
  const user = await findOrCreateUser(env, googleUser);
  const token = await jwt.sign({ id: user.id }, env.JWT_SECRET);

  return new Response(null, {
    status: 302,
    headers: {
      location: "/",
      "set-cookie": `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    },
  });
}

async function addPage(request: Request, env: Env, pageId: string): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (!userId) return json({ error: "unauthorized" }, { status: 401 });

  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_pages (user_id, page_id) VALUES (?1, ?2)",
  )
    .bind(userId, pageId)
    .run();

  return json({ ok: true, pageId });
}

/**
 * Pin (POST) or unpin (DELETE) one of the caller's saved drafts. Only touches a
 * page the user has saved; an unknown/unsaved page id 404s so the client can
 * tell "not yours" apart from a successful toggle.
 */
async function setPinned(
  request: Request,
  env: Env,
  pageId: string,
  pinned: boolean,
): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (!userId) return json({ error: "unauthorized" }, { status: 401 });

  const { meta } = await env.DB.prepare(
    `UPDATE user_pages
     SET pinned_at = ${pinned ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : "NULL"}
     WHERE user_id = ?1 AND page_id = ?2`,
  )
    .bind(userId, pageId)
    .run();

  if (!meta.changes) return json({ error: "not found" }, { status: 404 });
  return json({ ok: true, pageId, pinned });
}

export function routeApiRequest(request: Request, env: Env): Response | Promise<Response> | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true });
  }

  if (url.pathname === "/api/login" && (request.method === "GET" || request.method === "POST")) {
    return startGoogleLogin(request, env);
  }

  if (url.pathname === "/api/login/callback" && request.method === "GET") {
    return finishGoogleLogin(request, env).catch((error) => {
      console.error("Error processing OAuth callback:", error);
      return errorResponse(error instanceof Error ? error.message : String(error));
    });
  }

  if (url.pathname === "/api/pages" && request.method === "GET") {
    return listPages(request, env);
  }

  const addMatch = url.pathname.match(/^\/api\/add\/([^/]+)\/?$/);
  if (addMatch && (request.method === "GET" || request.method === "POST")) {
    return addPage(request, env, decodeURIComponent(addMatch[1]));
  }

  const pinMatch = url.pathname.match(/^\/api\/pin\/([^/]+)\/?$/);
  if (pinMatch && (request.method === "POST" || request.method === "DELETE")) {
    return setPinned(request, env, decodeURIComponent(pinMatch[1]), request.method === "POST");
  }

  return json({ error: "not found" }, { status: 404 });
}
