import { A, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { usePages } from "../stores/pages";
import { SettingsIcon, SidebarIcon } from "./icons";
import { DEFAULT_USERNAME, ui } from "../stores/ui";
import type { DraftSummary } from "../stores/draftSummaries";

type SortKey = "created" | "modified" | "name";

const SORT_STORAGE_KEY = "sidebar-sort";

function SlidingSidebar(props: { children: (closeIfMobile: () => void) => JSX.Element }) {
  return (
    <div
      class="fixed inset-y-0 left-0 z-20 h-dvh shrink-0 grow-0"
      classList={{
        "transition-[width] duration-200 ease-out": ui.sidebarReady(),
        "w-2xs md:w-3xs max-w-full": ui.sidebarOpen(),
        "w-0": !ui.sidebarOpen(),
      }}
    >
      <Show when={ui.sidebarOpen()}>
        <button
          type="button"
          aria-label="Close sidebar"
          class="fixed inset-0 md:hidden bg-chosen/60"
          onClick={ui.closeSidebarIfMobile}
        />
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

function DraftSearchAndList(props: {
  activeId?: string;
  pages: DraftSummary[];
  loading: boolean;
  closeIfMobile: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [sortBy, setSortBy] = createSignal<SortKey>(loadSort());
  let searchInput!: HTMLInputElement;

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

  const visiblePages = createMemo(() => {
    const search = query().trim().toLocaleLowerCase();
    const filtered = search
      ? props.pages.filter((page) => page.title.toLocaleLowerCase().includes(search))
      : props.pages;
    return [...filtered].sort((a, b) => comparePages(a, b, sortBy()));
  });

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
        onClick={props.closeIfMobile}
      >
        {page.title}
      </A>
    </li>
  );

  return (
    <>
      <div>
        <div class="flex items-center gap-0 mx-2 border-y border-y-lines px-1 py-1">
          <input
            ref={searchInput}
            placeholder="Search..."
            class="w-full rounded-md py-2 px-1 outline-0"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
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
              props.closeIfMobile();
            }}
          >
            +
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Show when={!props.loading} fallback={<p class="py-3 px-4 opacity-50">Loading drafts…</p>}>
          <Show when={visiblePages().length}>
            <div class="grid gap-1 min-w-0 px-2 pt-2">
              <ul class="min-w-0">
                <For each={visiblePages()}>{Item}</For>
              </ul>
            </div>
          </Show>
        </Show>
      </div>
    </>
  );
}

export default function Sidebar(props: { activeId?: string }) {
  const { pages, loading, signedOut } = usePages();

  createEffect(() => {
    props.activeId;
    ui.closeSidebarIfMobile();
  });

  return (
    <SlidingSidebar>
      {(closeIfMobile) => (
        <aside
          class="absolute inset-y-0 left-0 w-2xs md:w-3xs bg-layer flex flex-col h-dvh overscroll-contain border-r border-lines text-sm select-none"
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

          <DraftSearchAndList
            activeId={props.activeId}
            pages={pages()}
            loading={loading()}
            closeIfMobile={closeIfMobile}
          />

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
              placeholder={DEFAULT_USERNAME}
              value={ui.username()}
              onInput={(event) => ui.setUsername(event.currentTarget.value)}
            />
            <A class="opacity-40 hover:opacity-100" href="/settings">
              <SettingsIcon />
            </A>
          </div>
        </aside>
      )}
    </SlidingSidebar>
  );
}
