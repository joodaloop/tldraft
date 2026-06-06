import { A, useNavigate } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { usePages, type PageEntry } from "../stores/pages";

type SortKey = "created" | "modified" | "name";

// Local-only drafts have no updated_at (and a blank created_at), so they sort to
// the bottom under created/modified — the server supplies both for saved drafts.
function comparePages(a: PageEntry, b: PageEntry, key: SortKey): number {
  if (key === "name") {
    return (a.title || "Untitled").localeCompare(b.title || "Untitled");
  }
  if (key === "modified") {
    return (b.updated_at || "").localeCompare(a.updated_at || "");
  }
  // created: newest first.
  return (b.created_at || "").localeCompare(a.created_at || "");
}

/**
 * Lists the user's drafts. The resource is owned by the app root (see
 * `PagesProvider`), which diffs a local IndexedDB scan against the server list
 * to split drafts into saved vs. local-only ("unsaved"); this component just
 * renders its loading / signed-out / empty / loaded states.
 */
export default function Sidebar(props: { activeId?: string }) {
  const { saved, unsaved, loading, signedOut } = usePages();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = createSignal<SortKey>("created");

  const sortedSaved = createMemo(() => [...saved()].sort((a, b) => comparePages(a, b, sortBy())));
  const sortedUnsaved = createMemo(() => [...unsaved()].sort((a, b) => comparePages(a, b, sortBy())));

  const Item = (page: { page_id: string; title?: string }) => (
    <li>
      <A
        classList={{
          "truncate px-2 py-1 rounded-sm block": true,
          "bg-chosen": page.page_id === props.activeId,
        }}
        href={`/draft/${encodeURIComponent(page.page_id)}`}
        aria-current={page.page_id === props.activeId ? "page" : undefined}
      >
        {page.title || "Untitled"}
      </A>
    </li>
  );

  return (
    <aside
      class="w-3xs shrink-0 grow-0 bg-layer flex flex-col gap-4 h-dvh border-r border-lines py-3 px-2 text-sm select-none"
      aria-label="Your drafts"
    >
      <header class="flex gap-0 justify-between items-center">
        <A class="px-2" href="/">
          Drafts
        </A>
        <div class="flex items-center gap-0">
          <div class="relative px-2 cursor-pointer" aria-hidden="false">
            <span aria-hidden="true">▾</span>
            <select
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Sort drafts"
              value={sortBy()}
              onChange={(e) => setSortBy(e.currentTarget.value as SortKey)}
            >
              <option value="created">created</option>
              <option value="modified">modified</option>
              <option value="name">name</option>
            </select>
          </div>
          <button class="px-2" type="button" onClick={() => navigate(`/draft/${crypto.randomUUID()}`)}>
            +
          </button>
        </div>
      </header>

      <Show when={!loading()} fallback={<p class="sidebar-status">Loading…</p>}>
        <Show
          when={!signedOut()}
          fallback={
            <div class="px-3 grid gap-2 text-center mt-4">
              <p class="opacity-50">Sign in to see your saved drafts.</p>
              <form method="post" action="/api/login" class="auth-form">
                <button class="w-full bg-white py-1.5 rounded-sm text-sm" type="submit">
                  Continue with Google
                </button>
              </form>
            </div>
          }
        >
          <Show when={saved().length || unsaved().length} fallback={<p>No drafts yet.</p>}>
            <Show when={saved().length}>
              <div class="grid gap-1">
                <Show when={unsaved().length}>
                  <p class="opacity-50 px-2">Drafts linked to your account</p>
                </Show>
                <ul class="min-w-0">
                  <For each={sortedSaved()}>{Item}</For>
                </ul>
              </div>
            </Show>
          </Show>
        </Show>

        <Show when={unsaved().length}>
          <div class="grid gap-1 min-w-0">
            <p class="opacity-50 px-2">Stray drafts</p>
            <ul class="min-w-0">
              <For each={sortedUnsaved()}>{Item}</For>
            </ul>
          </div>
        </Show>
      </Show>
    </aside>
  );
}
