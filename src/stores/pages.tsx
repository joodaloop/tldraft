import {
  createContext,
  createResource,
  useContext,
  type ParentProps,
  type Resource,
} from "solid-js";

export interface PageEntry {
  page_id: string;
  created_at: string;
}

async function fetchPages(): Promise<PageEntry[]> {
  // Cookie carries the session JWT; the worker gates /api/pages on it.
  const res = await fetch("/api/pages", { credentials: "include" });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`failed to load pages (${res.status})`);
  const data = (await res.json()) as { pages: PageEntry[] };
  return data.pages;
}

interface PagesStore {
  pages: Resource<PageEntry[]>;
  /** Re-run the /api/pages fetch, e.g. after saving a new page. */
  refetch: () => void;
}

const PagesContext = createContext<PagesStore>();

/**
 * Holds the user's saved-pages resource at the app root so it's fetched once on
 * load and shared across routes. The request runs in the background — children
 * render immediately and react as the resource resolves.
 */
export function PagesProvider(props: ParentProps) {
  const [pages, { refetch }] = createResource(fetchPages);
  return (
    <PagesContext.Provider value={{ pages, refetch }}>
      {props.children}
    </PagesContext.Provider>
  );
}

export function usePages(): PagesStore {
  const ctx = useContext(PagesContext);
  if (!ctx) throw new Error("usePages must be used within a PagesProvider");
  return ctx;
}
