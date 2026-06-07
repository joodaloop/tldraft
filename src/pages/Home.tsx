import { A, useNavigate } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { usePages } from "../stores/pages";

export default function Home() {
  const navigate = useNavigate();
  const { pages, loading } = usePages();

  const recentPages = createMemo(() =>
    [...pages()]
      .sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""))
      .slice(0, 5),
  );

  const newDraft = () => {
    navigate(`/draft/${crypto.randomUUID()}`);
  };

  return (
    <main class="max-w-md mx-auto my-32 px-6">
      <h1 class="text-5xl font-bold text-center mb-6">tldraft</h1>
      <p class="mb-4">Realtime collaborative text editing that also works completely offline, without an account.</p>

      <p>
        The app will <em>always</em> load, regardless of if you're online, and any edits you make while offline will be
        saved once you reconnect later.
      </p>

      <div class="mt-16">
        <h2 class="font-black text-center"> your drafts </h2>

        <button type="button" class="w-full px-2 py-1.5 opacity-50 hover:opacity-100" onClick={newDraft}>
          + create new draft
        </button>

        <Show when={!loading()}>
          <Show when={recentPages().length}>
            <section aria-label="Recent notes">
              <ul class="mt-4">
                <For each={recentPages()}>
                  {(page) => (
                    <li>
                      <A
                        class="flex group items-center gap-2.5 rounded-sm py-2 min-w-0 text-sm"
                        href={`/draft/${encodeURIComponent(page.page_id)}`}
                      >
                        <div class="opacity-40 group-hover:opacity-100">→</div>
                        <div class="font-medium underline underline-offset-3 decoration-stone-300 group-hover:decoration-stone-600 truncate">
                          {page.title}
                        </div>
                      </A>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
        </Show>
      </div>

      <h2 class="mt-16 mb-6 font-black text-center"> updates</h2>

      <div class="grid gap-6">
        <article>
          <h3 class="mb-1.5 opacity-40">For Nihal,</h3>
          <p>
            Added "create new draft" button to home page along with doc list. Moved login button to the bottom of the
            sidebar.
          </p>
        </article>

        <article>
          <h3 class="mb-1.5 opacity-40">For Nihal,</h3>
          <p>Improved the sidebar experience by making separate ones for mobile/desktop.</p>
        </article>

        <article>
          <h3 class="mb-1.5 opacity-40">For Manav,</h3>
          <p>Improved collaborative editing, by keeping the cursor position stable in the face of remote updates.</p>
        </article>
        <article>
          <h3 class="mb-1.5 opacity-40">For Nobu,</h3>
          <p>Fixed mobile functionality by adding an open/close button to the sidebar.</p>
        </article>
        <article>
          <h3 class="mb-1.5 opacity-40">For Nihal,</h3>
          <p>Added the ability to delete pages if you own them, or just forget them (remove from sidebar) if not.</p>
        </article>
      </div>
    </main>
  );
}
