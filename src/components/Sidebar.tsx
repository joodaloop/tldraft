import { A, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { usePages } from "../stores/pages";
import { ui } from "../stores/ui";
import type { DraftSummary } from "../stores/draftSummaries";

type SortKey = "created" | "modified" | "name";

const SORT_STORAGE_KEY = "sidebar-sort";

function SlidingSidebar(props: { children: (closeIfMobile: () => void) => JSX.Element }) {
  return (
    <div
      class="absolute md:relative inset-y-0 left-0 z-20 h-dvh shrink-0 grow-0"
      classList={{
        "transition-[width] duration-200 ease-out": ui.sidebarReady(),
        "w-2xs md:w-3xs max-w-full": ui.sidebarOpen(),
        "w-0": !ui.sidebarOpen(),
      }}
    >
      <Show when={ui.sidebarOpen()}>
        <div class="fixed inset-0 md:hidden bg-chosen/60" />
      </Show>

      {props.children(ui.closeSidebarIfMobile)}

      {/*<button
        type="button"
        class="fixed group -bottom-px w-30 -left-px z-10 p-3 px-4 text-left rounded-tr-lg transition-colors duration-[0s] "
        classList={{
          "delay-100": open(),
          "bg-layer md:bg-transparent ": !open(),
        }}
        aria-label={open() ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={open()}
        onClick={toggleOpen}
      >
        <div class="opacity-60 group-hover:opacity-100">{open() ? "hide sidebar" : "show sidebar"}</div>
      </button>*/}
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

export default function Sidebar(props: { activeId?: string }) {
  const { pages, loading, signedOut } = usePages();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = createSignal<SortKey>(loadSort());
  let searchInput!: HTMLInputElement;

  createEffect(() => {
    props.activeId;
    ui.closeSidebarIfMobile();
  });

  onMount(() => {
    const focusSearch = () => {
      searchInput.focus();
      searchInput.select();
    };

    window.addEventListener("drafts:focus-sidebar-search", focusSearch);
    onCleanup(() => window.removeEventListener("drafts:focus-sidebar-search", focusSearch));
  });

  const changeSort = (key: SortKey) => {
    setSortBy(key);
    localStorage.setItem(SORT_STORAGE_KEY, key);
  };

  const sortedPages = createMemo(() => [...pages()].sort((a, b) => comparePages(a, b, sortBy())));

  const Item = (page: DraftSummary, closeIfMobile: () => void) => (
    <li>
      <A
        classList={{
          "truncate px-2 py-1 rounded-sm block": true,
          "bg-chosen": page.page_id === props.activeId,
          "text-red-700": page.hasUnconfirmedChanges && !(page.page_id === props.activeId),
        }}
        href={`/draft/${encodeURIComponent(page.page_id)}`}
        aria-current={page.page_id === props.activeId ? "page" : undefined}
        onClick={closeIfMobile}
      >
        {page.title}
      </A>
    </li>
  );

  return (
    <SlidingSidebar>
      {(closeIfMobile) => (
        <aside
          class="absolute inset-y-0 left-0 w-2xs md:w-3xs bg-layer flex flex-col h-dvh border-r border-lines text-sm select-none"
          classList={{
            "-translate-x-full": !ui.sidebarOpen(),
            "transition-transform duration-200 ease-out": ui.sidebarReady(),
          }}
          aria-label="Your drafts"
        >
          <header class="flex gap-0 justify-between items-center py-2 mx-2">
            <A class="px-2 font-bold" href="/" onClick={closeIfMobile}>
              tldraft
            </A>
            <button onclick={ui.toggleSidebar} class="w-7 flex items-center justify-center p-1 z-10">
              <div class="opacity-40 hover:opacity-100">
                <SidebarIcon />
              </div>
            </button>
          </header>

          <div>
            <div class="flex items-center gap-0 mx-2 border-y border-y-lines px-1 py-1">
              <input ref={searchInput} placeholder="Search..." class="w-full rounded-md py-2 px-1 outline-0" />
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
                class="px-1 pb-0.5 text-lg! leading-4 opacity-40 hover:opacity-100"
                type="button"
                onClick={() => {
                  navigate(`/draft/${crypto.randomUUID()}`);
                  closeIfMobile();
                }}
              >
                +
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <Show when={!loading()} fallback={<p class="py-3 px-4 opacity-50">Loading drafts…</p>}>
              <Show when={pages().length}>
                <div class="grid gap-1 min-w-0 px-2 pt-2">
                  <ul class="min-w-0">
                    <For each={sortedPages()}>{(page) => Item(page, closeIfMobile)}</For>
                  </ul>
                </div>
              </Show>
            </Show>
          </div>

          <Show when={signedOut()}>
            <div class="grid gap-2 mx-2 border-t border-lines px-2 py-4">
              <form method="post" action="/api/login">
                <button class="w-full bg-white py-1.5 rounded-md text-sm border-lines border" type="submit">
                  Login with Google
                </button>
              </form>
              <p class="opacity-50 text-xs">Sign in to link these drafts to an account across devices.</p>
            </div>
          </Show>

          <div class="mx-2 border-t border-lines px-2 py-3 flex justify-between gap-4">
            <input
              aria-label="Username"
              class="w-full rounded-md bg-transparent outline-0"
              placeholder="anonymoose"
              value={ui.username()}
              onInput={(event) => ui.setUsername(event.currentTarget.value)}
            />
            <A class="opacity-40 hover:opacity-100" href="/settings">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="icon icon-tabler icons-tabler-outline icon-tabler-settings"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
                <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
              </svg>
            </A>
          </div>
        </aside>
      )}
    </SlidingSidebar>
  );
}

function SidebarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="icon icon-tabler icons-tabler-outline icon-tabler-layout-sidebar"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" />
      <path d="M9 4l0 16" />
    </svg>
  );
}
