import { A } from "@solidjs/router";
import { For, Show, type Resource } from "solid-js";
import type { PageEntry } from "../stores/pages";

/**
 * Lists the signed-in user's saved drafts. The resource is owned by the app
 * root (see `PagesProvider`) and passed in, so this component just renders its
 * loading / error / empty / loaded states.
 */
export default function Sidebar(props: {
  pages: Resource<PageEntry[]>;
  activeId?: string;
}) {
  return (
    <aside class="sidebar" aria-label="Your drafts">
      <p class="eyebrow">Your drafts</p>
      <Show when={!props.pages.loading} fallback={<p class="sidebar-status">Loading…</p>}>
        <Show
          when={!props.pages.error}
          fallback={<p class="sidebar-status">Sign in to see your drafts.</p>}
        >
          <Show
            when={props.pages()?.length}
            fallback={<p class="sidebar-status">No drafts yet.</p>}
          >
            <ul class="sidebar-list">
              <For each={props.pages()}>
                {(page) => (
                  <li>
                    <A
                      class="sidebar-link"
                      href={`/draft/${encodeURIComponent(page.page_id)}`}
                      aria-current={page.page_id === props.activeId ? "page" : undefined}
                    >
                      {page.page_id}
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </aside>
  );
}
