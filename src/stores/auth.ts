import { createSignal } from "solid-js";

const USER_ID_KEY = "drafts:user-id";

function loadUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

const [currentUserId, setCurrentUserId] = createSignal<string | null>(loadUserId());

export { currentUserId };

export function rememberUserId(userId: string): void {
  setCurrentUserId(userId);
  try {
    localStorage.setItem(USER_ID_KEY, userId);
  } catch {
    // best-effort; the signal still updates for this session
  }
}

export function clearUserId(): void {
  setCurrentUserId(null);
  try {
    localStorage.removeItem(USER_ID_KEY);
  } catch {
    // best-effort
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    clearUserId();
  }
  return response;
}
