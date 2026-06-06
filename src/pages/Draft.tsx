import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import Doc, { type DocStatus } from "../components/Doc";
import { usePages } from "../stores/pages";

export default function Draft() {
  const params = useParams();
  const { noteLocalPage } = usePages();
  const [status, setStatus] = createSignal<DocStatus>("connecting");
  const [showOffline, setShowOffline] = createSignal(false);

  createEffect(() => {
    if (status() === "halted") {
      setShowOffline(true);
      return;
    }

    if (status() !== "offline") {
      setShowOffline(false);
      return;
    }

    const timer = setTimeout(() => setShowOffline(true), 5000);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <main class="w-full relative">
      <section class="mx-auto w-full max-w-4xl py-16">
        <div class="hidden lg:block absolute top-3 left-0 text-center w-full text-sm opacity-30 px-8">
          Share the link to this page to collaborate in real time (no live cursors yet).
        </div>
        <Show when={params.id} keyed>
          {(id) => (
            <Doc
              room={id}
              onStatus={setStatus}
              onTitle={(title, updatedAt, hasUnconfirmedChanges) =>
                noteLocalPage(id, title, updatedAt, hasUnconfirmedChanges)
              }
            />
          )}
        </Show>
      </section>
      <div
        class="fixed top-3 right-4 text-sm text-red-700 opacity-0 z-10"
        classList={{
          "opacity-100": showOffline(),
        }}
        aria-label={`Draft connection status: ${status()}`}
        role="status"
      >
        offline :)
      </div>
    </main>
  );
}
