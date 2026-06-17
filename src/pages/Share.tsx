import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { PartySocket } from "partysocket";

import { SCHEMA_VERSION } from "../../shared/schema";
import { serverMessageSchema } from "../../worker/protocol";
import { apiFetch } from "../stores/auth";
import { saveCachedDoc } from "../stores/localDocs";

const defaultHost = () => window.location.host;

export default function Share() {
  const params = useParams();
  const navigate = useNavigate();
  const [error, setError] = createSignal<string | null>(null);
  let socket: PartySocket | undefined;
  let done = false;

  onMount(() => {
    const room = params.id;
    if (!room) {
      setError("Missing shared draft id.");
      return;
    }

    socket = new PartySocket({
      host: defaultHost(),
      party: "document-server",
      room,
    });

    socket.addEventListener("message", (event) => {
      if (done) return;

      try {
        const parsed = serverMessageSchema.safeParse(JSON.parse(event.data as string));
        if (!parsed.success) throw new Error("invalid server response");
        const msg = parsed.data;
        if (msg.type !== "init") return;
        if (msg.schemaVersion !== SCHEMA_VERSION) {
          throw new Error("This shared draft needs a newer app version.");
        }

        done = true;
        void saveCachedDoc(room, {
          schemaVersion: msg.schemaVersion,
          doc: msg.doc,
          version: msg.version,
          unconfirmed: [],
          updatedAt: new Date().toISOString(),
        })
          .then(() => apiFetch(`/api/add/${encodeURIComponent(room)}`, {
            method: "POST",
            credentials: "include",
          }))
          .catch(() => undefined)
          .then(() => {
            socket?.close();
            navigate(`/draft/${encodeURIComponent(room)}`, { replace: true });
          });
      } catch (err) {
        done = true;
        socket?.close();
        setError(err instanceof Error ? err.message : "Could not load shared draft.");
      }
    });

    socket.addEventListener("close", () => {
      if (!done) setError("Could not connect to this shared draft.");
    });

    socket.addEventListener("error", () => {
      if (!done) setError("Could not connect to this shared draft.");
    });
  });

  onCleanup(() => {
    done = true;
    socket?.close();
  });

  return (
    <main class="max-w-md mx-auto my-32 px-6 text-center">
      <Show
        when={error()}
        fallback={
          <>
            <h1 class="text-xl font-semibold mb-2">Opening shared draft…</h1>
            <p class="opacity-60">Connecting to the live document.</p>
          </>
        }
      >
        {(message) => (
          <>
            <h1 class="text-xl font-semibold mb-2">Could not open shared draft</h1>
            <p class="opacity-60">{message()}</p>
          </>
        )}
      </Show>
    </main>
  );
}
