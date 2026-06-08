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
import { apiFetch, currentUserId, rememberUserId } from "./auth";
import { deleteCachedDoc, scanCachedDocs } from "./localDocs";
import {
  buildDraftSummaries,
  serverSummaries,
  type DraftSummary,
  type LocalDraftRow,
  type ServerDraftRow,
} from "./draftSummaries";
import { serverDraftRowsSchema } from "./draftSchemas";

// --- Server list cache (localStorage) ---------------------------------------
// We persist the last successful /api/pages response so the next load can paint
// the saved drafts synchronously, before (and without waiting on) the network.
const CACHE_KEY = "drafts:pages";

function loadCachedList(): ServerDraftRow[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    const parsed = serverDraftRowsSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // no localStorage / corrupt JSON — just no warm cache
  }
}

function saveCachedList(pages: ServerDraftRow[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(pages));
  } catch {
    // best-effort; a failed write just means a colder load next time
  }
}

async function fetchPages(): Promise<ServerDraftRow[]> {
  // Cookie carries the session JWT; the worker gates /api/pages on it.
  const res = await apiFetch("/api/pages", { credentials: "include" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`failed to load pages (${res.status})`);
  const data = (await res.json()) as { pages?: unknown; userId?: unknown };
  if (typeof data.userId !== "string") throw new Error("invalid pages response");
  const parsed = serverDraftRowsSchema.safeParse(data.pages);
  if (!parsed.success) throw new Error("invalid pages response");
  rememberUserId(data.userId);
  return parsed.data;
}

async function scanLocalPages(): Promise<LocalDraftRow[]> {
  const records = await scanCachedDocs();
  return records.map(({ room, cached, visibleDoc }) => ({
    // created_at is left blank for local entries; the server list supplies the
    // real metadata for saved drafts. updatedAt is the cache's last-edit time
    // (Doc.tsx), so local-only drafts can still sort by "modified".
    page_id: room,
    created_at: "",
    updated_at: cached.updatedAt,
    title: pageTitleFromDocJSON(visibleDoc, "Untitled").slice(0, 80),
    hasUnconfirmedChanges: cached.unconfirmed.length > 0,
  }));
}

interface PagesStore {
  /**
   * Drafts known to this device: the server list merged with the local doc
   * cache. Drafts with local steps awaiting confirmation carry
   * `hasUnconfirmedChanges`.
   */
  pages: Accessor<DraftSummary[]>;
  /** True only when we have nothing to show yet and the fetch is still running. */
  loading: Accessor<boolean>;
  /** True when the fetch failed and there's nothing — cached or local — to show. */
  signedOut: Accessor<boolean>;
  /** The authenticated user id from the last successful session-backed API call. */
  currentUserId: Accessor<string | null>;
  /** Re-run the /api/pages fetch, e.g. after saving a new page. */
  refetch: () => void;
  /**
   * Register (or refresh the title of) a draft this device has locally, so the
   * sidebar reflects a newly-created or just-edited doc without a reload.
   */
  noteLocalPage: (
    page_id: string,
    title?: string,
    updated_at?: string,
    hasUnconfirmedChanges?: boolean,
  ) => void;
  /** Remove a draft from this device's local cache and in-memory draft list. */
  forgetLocalPage: (page_id: string) => Promise<void>;
}

const PagesContext = createContext<PagesStore>();

/**
 * Holds the user's drafts at the app root so they're resolved once on load and
 * shared across routes. The server list is seeded synchronously from a
 * localStorage cache (no flash), refreshed by a background /api/pages fetch
 * only when we already know the user is signed in, and merged with an
 * IndexedDB scan of this device's drafts. `noteLocalPage` lets the editor push
 * live local drafts (and their titles) into the store.
 */
export function PagesProvider(props: ParentProps) {
  const [cached, setCached] = createSignal<ServerDraftRow[] | null>(loadCachedList());
  const [server, { refetch: refetchServer, mutate }] = createResource(currentUserId, fetchPages);
  const [local, setLocal] = createSignal<LocalDraftRow[]>([]);

  const refetch = () => {
    if (currentUserId() !== null) void refetchServer();
  };

  const noteLocalPage = (
    page_id: string,
    title?: string,
    updated_at?: string,
    hasUnconfirmedChanges?: boolean,
  ) => {
    const name = (title ?? "").trim() || "Untitled";
    setLocal((prev) => {
      const i = prev.findIndex((p) => p.page_id === page_id);
      if (i === -1) {
        return [
          ...prev,
          { page_id, created_at: "", updated_at, title: name, hasUnconfirmedChanges },
        ];
      }
      const next = prev.slice();
      next[i] = {
        ...next[i],
        updated_at: updated_at ?? next[i].updated_at,
        title: name,
        hasUnconfirmedChanges:
          hasUnconfirmedChanges ?? next[i].hasUnconfirmedChanges,
      };
      return next;
    });
  };

  const forgetLocalPage = async (page_id: string) => {
    await deleteCachedDoc(page_id);
    setLocal((prev) => prev.filter((p) => p.page_id !== page_id));
    const nextServerPages = (serverReady() ? server() ?? [] : cached() ?? []).filter(
      (p) => p.page_id !== page_id,
    );
    mutate(nextServerPages);
    setCached(nextServerPages);
    saveCachedList(nextServerPages);
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
  const serverPages = () => (serverReady() ? server() ?? [] : cached() ?? []);

  const pages = () => buildDraftSummaries(serverPages(), local(), cached() ?? []);

  createEffect(() => {
    if (serverReady()) saveCachedList(serverSummaries(pages()));
  });

  const loading = () =>
    cached() === null &&
    (server.state === "pending" || server.state === "unresolved") &&
    local().length === 0;
  // Signed out reflects the auth state of the /api/pages fetch (a 401), not
  // whether we happen to have drafts cached/scanned locally. fetchPages throws
  // Error("unauthorized") specifically on a 401 so we can tell auth failures
  // apart from transient network/server errors.
  const signedOut = () =>
    currentUserId() === null ||
    (server.state === "errored" &&
      (server.error as Error | undefined)?.message === "unauthorized");

  return (
    <PagesContext.Provider
      value={{
        pages,
        loading,
        signedOut,
        currentUserId,
        refetch,
        noteLocalPage,
        forgetLocalPage,
      }}
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
