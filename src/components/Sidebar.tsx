import { A, useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { usePages } from "../stores/pages";

/**
 * Lists the user's drafts. The resource is owned by the app root (see
 * `PagesProvider`), which diffs a local IndexedDB scan against the server list
 * to split drafts into saved vs. local-only ("unsaved"); this component just
 * renders its loading / signed-out / empty / loaded states.
 */
export default function Sidebar(props: { activeId?: string }) {
  const { saved, unsaved, loading, signedOut } = usePages();
  const navigate = useNavigate();

  const Item = (page: { page_id: string; title?: string }) => (
    <li>
      <A
        class="truncate px-3 py-1 hover:bg-chosen block"
        href={`/draft/${encodeURIComponent(page.page_id)}`}
        aria-current={page.page_id === props.activeId ? "page" : undefined}
      >
        {page.title || "Untitled"}
      </A>
    </li>
  );

  return (
    <aside
      class="w-2xs shrink-0 grow-0 bg-layer flex flex-col gap-4 h-dvh border-r border-lines"
      aria-label="Your drafts"
    >
      <header class="flex gap-0 *:block *:p-3 *:py-1.5 justify-between">
        <A href="/">Drafts</A>
        <button type="button" onClick={() => navigate(`/draft/${crypto.randomUUID()}`)}>
          New page
        </button>
      </header>

      <Show when={!loading()} fallback={<p class="sidebar-status">Loading…</p>}>
        <Show
          when={!signedOut()}
          fallback={
            <div class="px-3 grid gap-2 text-center mt-4">
              <p class="opacity-50">Sign in to see your drafts.</p>
              <form method="post" action="/api/login" class="auth-form">
                <button class="w-full bg-white py-1.5 rounded-sm text-sm" type="submit">
                  Continue with Google
                </button>
              </form>
            </div>
          }
        >
          <Show when={saved().length || unsaved().length} fallback={<p class="sidebar-status">No drafts yet.</p>}>
            <Show when={unsaved().length}>
              <div class="grid gap-1 min-w-0">
                <p class="opacity-50 px-3">Unsaved drafts</p>
                <ul class="min-w-0">
                  <For each={unsaved()}>{Item}</For>
                </ul>
              </div>
            </Show>
            <Show when={saved().length}>
              <Show when={unsaved().length}>
                <p class="opacity-50 px-3">Saved</p>
              </Show>
              <ul class="min-w-0">
                <For each={saved()}>{Item}</For>
              </ul>
            </Show>
          </Show>
        </Show>
      </Show>
    </aside>
  );
}
