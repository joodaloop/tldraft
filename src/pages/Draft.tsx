import { useParams } from "@solidjs/router";
import { Show } from "solid-js";
import Doc from "../components/Doc";
import { usePages } from "../stores/pages";

export default function Draft() {
  const params = useParams();
  const { noteLocalPage } = usePages();

  return (
    <main class="w-full relative">
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
