import jwt from "@tsndr/cloudflare-worker-jwt";

import type { Env } from "../index";

interface SessionPayload {
  id?: string;
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function currentUserId(request: Request, env: Env): Promise<string | null> {
  const token = getCookie(request, "session");
  if (!token || !(await jwt.verify(token, env.JWT_SECRET))) return null;
  const { payload } = jwt.decode(token) as { payload: SessionPayload };
  return typeof payload.id === "string" ? payload.id : null;
}
