import { useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import Doc from "../components/Doc";
import { usePages } from "../stores/pages";

export default function Draft() {
  const params = useParams();
  const { refetch, noteLocalPage } = usePages();

  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  async function savePage() {
    if (!params.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/add/${encodeURIComponent(params.id)}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 401) throw new Error("Sign in to save drafts.");
      if (!res.ok) throw new Error(`Couldn't save (${res.status}).`);
      // Saved — re-run the resource so the sidebar reflects the new page.
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="w-full relative">
      <div class="flex p-3 px-4 gap-4 justify-end fixed top-0 right-0">
        <div class="grid content-end">
          <button class="button primary" disabled={saving()} onClick={savePage}>
            {saving() ? "Saving…" : saveError() || "Save to my drafts"}
          </button>
          {/*<Show when={saveError()}>
            <p class="save-error">{saveError()}</p>
          </Show>*/}
        </div>
      </div>

      <section class="mx-auto w-full max-w-4xl my-16 px-6">
        <Show when={params.id} keyed>
          {(id) => (
            <Doc
              room={id}
              onTitle={(title, updatedAt, offline) =>
                noteLocalPage(id, title, updatedAt, offline)
              }
            />
          )}
        </Show>
      </section>
    </main>
  );
}
