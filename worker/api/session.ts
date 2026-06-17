import jwt from "@tsndr/cloudflare-worker-jwt";

import type { Env } from "../index";

interface SessionPayload {
  id?: string;
  iat?: number;
  exp?: number;
}

export function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function currentUserId(request: Request, env: Env): Promise<string | null> {
  const token = getCookie(request, "session");
  if (!token) return null;

  try {
    const verified = await jwt.verify<SessionPayload>(token, env.JWT_SECRET);
    const payload = verified?.payload;
    if (!payload) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= now) return null;

    return typeof payload.id === "string" ? payload.id : null;
  } catch {
    return null;
  }
}
