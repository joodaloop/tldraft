import { A, useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import Doc from "../components/Doc";
import Sidebar from "../components/Sidebar";
import { usePages } from "../stores/pages";

export default function Draft() {
  const params = useParams();
  const { pages, refetch } = usePages();

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
    <main class="page-shell draft-layout">
      {/* Renders immediately and fills in once /api/pages resolves. */}
      <Sidebar pages={pages} activeId={params.id} />
      <section class="page-card">
        <p class="eyebrow">Draft</p>
        <h1>{params.id}</h1>
        {/*
          The route `:id` is the document id. We pass it straight through as
          the room name, which routes the socket to the DocumentServer Durable
          Object instance named `:id` — i.e. one authority per draft id.
          `keyed` re-mounts the editor (new socket) when the id changes.
        */}
        <Show when={params.id} keyed>
          {(id) => <Doc room={id} />}
        </Show>
        <div class="actions">
          <button class="button primary" disabled={saving()} onClick={savePage}>
            {saving() ? "Saving…" : "Save to my drafts"}
          </button>
          <A class="button" href="/">
            Back home
          </A>
        </div>
        <Show when={saveError()}>
          <p class="save-error">{saveError()}</p>
        </Show>
      </section>
    </main>
  );
}
