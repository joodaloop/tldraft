import { A, useNavigate } from "@solidjs/router";
import { createMemo, createSignal, For, Show, type Accessor, type JSX } from "solid-js";
import { usePages } from "../stores/pages";
import type { DraftSummary } from "../stores/draftSummaries";

type SortKey = "created" | "modified" | "name";

const SORT_STORAGE_KEY = "sidebar-sort";

function SlidingSidebar(props: { children: (open: Accessor<boolean>) => JSX.Element }) {
  const [open, setOpen] = createSignal(true);

  return (
    <div
      class="absolute md:relative inset-y-0 left-0 z-20 h-dvh shrink-0 grow-0 transition-[width] duration-200 ease-out"
      classList={{ "w-3xs": open(), "w-0": !open() }}
    >
      {props.children(open)}
      <button
        type="button"
        class="fixed group -bottom-px w-30 -left-px z-10 p-3 px-4 text-left"
        classList={{
          "": open(),
          "bg-layer md:bg-transparent rounded-tr-lg": !open(),
        }}
        aria-label={open() ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={open()}
        onClick={() => setOpen((value) => !value)}
      >
        <div class="opacity-60 group-hover:opacity-100">{open() ? "hide sidebar" : "show sidebar"}</div>
      </button>
    </div>
  );
}

function loadSort(): SortKey {
  const stored = localStorage.getItem(SORT_STORAGE_KEY);
  return stored === "created" || stored === "modified" || stored === "name" ? stored : "created";
}

// Local-only drafts have no updated_at (and a blank created_at), so they sort to
// the bottom under created/modified until the server links them.
function comparePages(a: DraftSummary, b: DraftSummary, key: SortKey): number {
  if (key === "name") {
    return a.title.localeCompare(b.title);
  }
  if (key === "modified") {
    return (b.updated_at || "").localeCompare(a.updated_at || "");
  }
  // created: newest first.
  return (b.created_at || "").localeCompare(a.created_at || "");
}

/**
 * Lists the user's drafts. The resource is owned by the app root (see
 * `PagesProvider`), which merges the server list with this device's local
 * IndexedDB cache; this component just renders its loading / signed-out /
 * empty / loaded states.
 */
export default function Sidebar(props: { activeId?: string }) {
  const { pages, loading, signedOut } = usePages();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = createSignal<SortKey>(loadSort());

  const changeSort = (key: SortKey) => {
    setSortBy(key);
    localStorage.setItem(SORT_STORAGE_KEY, key);
  };

  const sortedPages = createMemo(() => [...pages()].sort((a, b) => comparePages(a, b, sortBy())));

  const Item = (page: DraftSummary) => (
    <li>
      <A
        classList={{
          "truncate px-2 py-1 rounded-sm block": true,
          "bg-chosen": page.page_id === props.activeId,
          "text-red-700": page.hasUnconfirmedChanges && !(page.page_id === props.activeId),
        }}
        href={`/draft/${encodeURIComponent(page.page_id)}`}
        aria-current={page.page_id === props.activeId ? "page" : undefined}
      >
        {page.title}
      </A>
    </li>
  );

  return (
    <SlidingSidebar>
      {(open) => (
        <aside
          class="absolute inset-y-0 left-0 w-3xs bg-layer flex flex-col h-dvh border-r border-lines text-sm select-none transition-transform duration-200 ease-out"
          classList={{ "-translate-x-full": !open() }}
          aria-label="Your drafts"
        >
          <header class="flex gap-0 justify-between items-center py-3 mx-2 border-b border-lines">
            <A class="px-2 font-bold" href="/">
              tldraft
            </A>
            <div class="flex items-center gap-0">
              <div class="relative px-2 opacity-40 hover:opacity-100" aria-hidden="false">
                <span aria-hidden="true">↓</span>
                <select
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Sort drafts"
                  value={sortBy()}
                  onChange={(e) => changeSort(e.currentTarget.value as SortKey)}
                >
                  <option value="created">created</option>
                  <option value="modified">modified</option>
                  <option value="name">name</option>
                </select>
              </div>
              <button
                class="px-1.5 pb-0.5 text-lg! leading-4 opacity-40 hover:opacity-100"
                type="button"
                onClick={() => navigate(`/draft/${crypto.randomUUID()}`)}
              >
                +
              </button>
            </div>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <Show when={!loading()} fallback={<p class="py-3 px-4 opacity-50">Loading drafts…</p>}>
              <Show when={signedOut()}>
                <div class="grid gap-2 mx-2 border-b border-lines px-2 py-5">
                  <form method="post" action="/api/login">
                    <button class="w-full bg-white py-1.5 rounded-md text-sm border-lines border" type="submit">
                      Login with Google
                    </button>
                  </form>
                  <p class="opacity-50 text-xs">Sign in to link these drafts to an account across devices.</p>
                </div>
              </Show>

              <Show when={pages().length}>
                <div class="grid gap-1 min-w-0 px-2 pt-3">
                  <ul class="min-w-0">
                    <For each={sortedPages()}>{Item}</For>
                  </ul>
                </div>
              </Show>
            </Show>
          </div>
          <div class="h-11 shrink-0 border-t border-lines mx-2" aria-hidden="true" />
        </aside>
      )}
    </SlidingSidebar>
  );
}
