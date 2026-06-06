import { useParams } from "@solidjs/router";
import { Show } from "solid-js";
import Doc from "../components/Doc";
import { usePages } from "../stores/pages";

export default function Draft() {
  const params = useParams();
  const { noteLocalPage } = usePages();

  return (
    <main class="w-full relative">
      <section class="mx-auto w-full max-w-4xl py-16">
        <div class="absolute top-3 left-0 text-center w-full text-sm opacity-30 px-8 text-balance">
          Share the link to this page to collaborate in real time (no live cursors yet).
        </div>
        <Show when={params.id} keyed>
          {(id) => (
            <Doc room={id} onTitle={(title, updatedAt, offline) => noteLocalPage(id, title, updatedAt, offline)} />
          )}
        </Show>
      </section>
    </main>
  );
}
