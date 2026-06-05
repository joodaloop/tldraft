import { A, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import Doc from "../components/Doc";

export default function Draft() {
  const params = useParams();

  return (
    <main class="page-shell">
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
        <A class="button" href="/">
          Back home
        </A>
      </section>
    </main>
  );
}
