import {
  createContext,
  createEffect,
  createResource,
  createSignal,
  onMount,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import { pageTitleFromDocJSON } from "../../shared/pageText";
import { scanCachedDocs } from "./localDocs";

export interface PageEntry {
  page_id: string;
  created_at: string;
  /** Last-edit time from the server (pages.updated_at). Absent on local-only drafts. */
  updated_at?: string;
  /** Display name: the doc's first line, or "Untitled". Absent on raw server rows. */
  title?: string;
}

// --- Server list cache (localStorage) ---------------------------------------
// We persist the last successful /api/pages response so the next load can paint
// the saved drafts synchronously, before (and without waiting on) the network.
const CACHE_KEY = "drafts:pages";

function loadCachedList(): PageEntry[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as PageEntry[]) : null;
  } catch {
    return null; // no localStorage / corrupt JSON — just no warm cache
  }
}

function saveCachedList(pages: PageEntry[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(pages));
  } catch {
    // best-effort; a failed write just means a colder load next time
  }
}

async function fetchPages(): Promise<PageEntry[]> {
  // Cookie carries the session JWT; the worker gates /api/pages on it.
  const res = await fetch("/api/pages", { credentials: "include" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`failed to load pages (${res.status})`);
  const data = (await res.json()) as { pages: PageEntry[] };
  return data.pages;
}

async function scanLocalPages(): Promise<PageEntry[]> {
  const records = await scanCachedDocs();
  return records.map(({ room, cached }) => ({
    // created_at is left blank for local entries; the server list supplies the
    // real metadata for saved drafts. updatedAt is the cache's last-edit time
    // (Doc.tsx), so local-only drafts can still sort by "modified".
    page_id: room,
    created_at: "",
    updated_at: cached.updatedAt,
    title: pageTitleFromDocJSON(cached.doc, "Untitled").slice(0, 80),
  }));
}

interface PagesStore {
  /**
   * Drafts confirmed by the server: the live /api/pages response once it
   * resolves, otherwise the cached copy from the previous session so saved
   * drafts paint immediately on load. Titles are filled in from the local doc
   * cache where this device has the draft.
   */
  saved: Accessor<PageEntry[]>;
  /** Local drafts the server doesn't know about (scanned but not in `saved`). */
  unsaved: Accessor<PageEntry[]>;
  /** True only when we have nothing to show yet and the fetch is still running. */
  loading: Accessor<boolean>;
  /** True when the fetch failed and there's nothing — cached or local — to show. */
  signedOut: Accessor<boolean>;
  /** Re-run the /api/pages fetch, e.g. after saving a new page. */
  refetch: () => void;
  /**
   * Register (or refresh the title of) a draft this device has locally, so the
   * sidebar reflects a newly-created or just-edited doc without a reload.
   */
  noteLocalPage: (page_id: string, title?: string, updated_at?: string) => void;
}

const PagesContext = createContext<PagesStore>();

function usableTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  return trimmed && trimmed !== "Untitled" ? trimmed : undefined;
}

function isPlaceholderServerTitle(page: PageEntry): boolean {
  const title = page.title?.trim();
  return !title || title === "Untitled" || title === page.page_id;
}

function displayTitle(
  page: PageEntry,
  localTitle: string | undefined,
  cachedTitle: string | undefined,
): string {
  if (isPlaceholderServerTitle(page)) {
    return usableTitle(localTitle) ?? usableTitle(cachedTitle) ?? page.title ?? "Untitled";
  }

  return usableTitle(localTitle) ?? page.title ?? "Untitled";
}

/**
 * Holds the user's drafts at the app root so they're resolved once on load and
 * shared across routes. The server list is seeded synchronously from a
 * localStorage cache (no flash), refreshed by a background /api/pages fetch,
 * and diffed against an IndexedDB scan of this device's drafts to split the
 * sidebar into saved vs. local-only ("unsaved") entries. `noteLocalPage` lets
 * the editor push live local drafts (and their titles) into the store.
 */
export function PagesProvider(props: ParentProps) {
  const cached = loadCachedList();
  const [server, { refetch }] = createResource(fetchPages);
  const [local, setLocal] = createSignal<PageEntry[]>([]);

  const noteLocalPage = (page_id: string, title?: string, updated_at?: string) => {
    const name = (title ?? "").trim() || "Untitled";
    setLocal((prev) => {
      const i = prev.findIndex((p) => p.page_id === page_id);
      if (i === -1) return [...prev, { page_id, created_at: "", updated_at, title: name }];
      const next = prev.slice();
      next[i] = { ...next[i], updated_at: updated_at ?? next[i].updated_at, title: name };
      return next;
    });
  };

  // Seed from the IndexedDB scan once, letting any live entries noted in the
  // meantime (e.g. a doc that mounted before the scan resolved) win.
  onMount(() => {
    void scanLocalPages().then((scanned) =>
      setLocal((prev) => {
        const byId = new Map(scanned.map((p) => [p.page_id, p]));
        for (const p of prev) byId.set(p.page_id, p);
        return [...byId.values()];
      }),
    );
  });

  const serverReady = () =>
    server.state === "ready" || server.state === "refreshing";
  const serverPages = () => (serverReady() ? server() ?? [] : cached ?? []);

  const localTitles = () => new Map(local().map((p) => [p.page_id, p.title]));
  const localUpdatedTimes = () => new Map(local().map((p) => [p.page_id, p.updated_at]));
  const cachedTitles = () => new Map((cached ?? []).map((p) => [p.page_id, p.title]));
  const saved = () => {
    const titles = localTitles();
    const updatedTimes = localUpdatedTimes();
    const cached = cachedTitles();
    return serverPages().map((p) => {
      const localUpdated = updatedTimes.get(p.page_id);
      return {
        ...p,
        updated_at:
          localUpdated && localUpdated > (p.updated_at ?? "")
            ? localUpdated
            : p.updated_at,
        title: displayTitle(p, titles.get(p.page_id), cached.get(p.page_id)),
      };
    });
  };
  const savedIds = () => new Set(serverPages().map((p) => p.page_id));
  const unsaved = () => local().filter((p) => !savedIds().has(p.page_id));

  createEffect(() => {
    if (serverReady()) saveCachedList(saved());
  });

  const loading = () =>
    cached === null &&
    (server.state === "pending" || server.state === "unresolved") &&
    local().length === 0;
  // Signed out reflects the auth state of the /api/pages fetch (a 401), not
  // whether we happen to have drafts cached/scanned locally. fetchPages throws
  // Error("unauthorized") specifically on a 401 so we can tell auth failures
  // apart from transient network/server errors.
  const signedOut = () =>
    server.state === "errored" &&
    (server.error as Error | undefined)?.message === "unauthorized";

  return (
    <PagesContext.Provider
      value={{ saved, unsaved, loading, signedOut, refetch, noteLocalPage }}
    >
      {props.children}
    </PagesContext.Provider>
  );
}

export function usePages(): PagesStore {
  const ctx = useContext(PagesContext);
  if (!ctx) throw new Error("usePages must be used within a PagesProvider");
  return ctx;
}
