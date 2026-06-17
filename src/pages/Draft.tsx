import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import Doc, { type DocStatus } from "../components/Doc";
import { apiFetch } from "../stores/auth";
import { usePages } from "../stores/pages";
import { ui } from "../stores/ui";
import type { PresencePeer } from "../../worker/protocol";
import { displayTitle } from "../../shared/pageText";

const DEFAULT_DOCUMENT_TITLE = "tldraft • shareable offline-first docs";

function DeleteConfirmation(props: {
  deleting: boolean;
  forgetsOnly: boolean;
  progressLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div class="mx-auto max-w-md h-[70dvh] flex flex-col justify-center text-center">
      <div class="grid gap-4">
        <div class="grid gap-1">
          <h1 class="text-lg font-semibold">{props.forgetsOnly ? "Forget this draft?" : "Delete this draft?"}</h1>
          <p class="text-sm opacity-60">
            {props.forgetsOnly
              ? "It will disappear from your sidebar until you visit this link again."
              : "This deletes the contents of this page."}
          </p>
        </div>
        <div class="flex justify-center gap-3.5">
          <button
            type="button"
            class="px-3 py-1.5 rounded-full border disabled:opacity-40"
            disabled={props.deleting}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-full border border-red-700 text-red-700 disabled:opacity-40"
            disabled={props.deleting}
            onClick={props.onConfirm}
          >
            {props.deleting ? props.progressLabel : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Draft() {
  const params = useParams();
  const navigate = useNavigate();
  const { pages, noteLocalPage, forgetLocalPage } = usePages();
  const [status, setStatus] = createSignal<DocStatus>("connecting");
  // const [showOffline, setShowOffline] = createSignal(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = createSignal<string | null>(null);
  const [deletingId, setDeletingId] = createSignal<string | null>(null);
  const [temporaryTopMessage, setTemporaryTopMessage] = createSignal<string | null>(null);
  const [, setLivePeers] = createSignal<PresencePeer[]>([]);
  let topMessageTimer: ReturnType<typeof setTimeout> | undefined;

  const activePage = createMemo(() => pages().find((page) => page.page_id === params.id));
  const confirmingDelete = () => confirmingDeleteId() === params.id;
  const deleting = () => deletingId() === params.id;
  const hasOfflineChanges = () =>
    (status() === "offline" || status() === "halted") && (activePage()?.hasUnconfirmedChanges ?? false);

  const topMessageIsAlert = () => temporaryTopMessage() !== null || hasOfflineChanges();
  const topMessage = () =>
    temporaryTopMessage() ??
    (hasOfflineChanges() ? "Offline — reconnect to save" : "Share this page's URL to edit it collaboratively.");
  const forgetsOnly = () => activePage()?.relationship !== "creator";
  const actionProgressLabel = () => (forgetsOnly() ? "Forgetting..." : "Deleting...");
  const actionError = () => `Could not ${forgetsOnly() ? "forget" : "delete"} this draft.`;

  createEffect(() => {
    const title = displayTitle(activePage()?.title);
    document.title = `${title} – tldraft`;
  });

  const showTemporaryMessage = (message: string) => {
    if (topMessageTimer) clearTimeout(topMessageTimer);
    setTemporaryTopMessage(message);
    topMessageTimer = setTimeout(() => {
      setTemporaryTopMessage(null);
      topMessageTimer = undefined;
    }, 3000);
  };

  const deleteDraft = async () => {
    const id = params.id;
    if (!id || deleting()) return;
    const errorMessage = actionError();

    setDeletingId(id);

    try {
      const res = await apiFetch(`/api/page/delete/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          await forgetLocalPage(id);
          if (params.id === id) navigate("/", { replace: true });
          return;
        }

        if (deletingId() === id) setDeletingId(null);
        if (confirmingDeleteId() === id) setConfirmingDeleteId(null);
        if (params.id === id) showTemporaryMessage(errorMessage);
        return;
      }

      await forgetLocalPage(id);
      if (params.id === id) navigate("/", { replace: true });
    } catch {
      if (deletingId() === id) setDeletingId(null);
      if (confirmingDeleteId() === id) setConfirmingDeleteId(null);
      if (params.id === id) showTemporaryMessage(errorMessage);
    }
  };

  onCleanup(() => {
    if (topMessageTimer) clearTimeout(topMessageTimer);
    document.title = DEFAULT_DOCUMENT_TITLE;
  });

  return (
    <main class="w-full relative">
      <div
        class="fixed w-full top-0 left-0 bg-background border-b border-b-lines z-10 transition-[padding]"
        classList={{ "md:pl-[16rem]": ui.sidebarOpen() }}
      >
        <div class="flex justify-between items-center">
          <div class="lg:w-8"></div>
          <div
            class="hidden lg:block text-center w-full text-sm opacity-40"
            classList={{ "text-red-800 opacity-100": topMessageIsAlert() }}
            role="status"
          >
            {topMessage()}
          </div>
          <div class="flex">
            <button
              type="button"
              class="p-2.5 px-3 opacity-40 hover:opacity-100 disabled:pointer-events-none disabled:opacity-20"
              disabled={!params.id || deleting()}
              onClick={() => params.id && setConfirmingDeleteId(params.id)}
            >
              remove
            </button>
          </div>
        </div>
      </div>

      <section class="mx-auto w-full max-w-4xl py-24">
        <Show when={confirmingDelete() || deleting()}>
          <DeleteConfirmation
            deleting={deleting()}
            forgetsOnly={forgetsOnly()}
            progressLabel={actionProgressLabel()}
            onCancel={() => setConfirmingDeleteId(null)}
            onConfirm={() => void deleteDraft()}
          />
        </Show>
        <Show when={!confirmingDelete() && !deleting() && params.id} keyed>
          {(id) => (
            <Doc
              room={id}
              username={ui.username()}
              onPresence={setLivePeers}
              onStatus={setStatus}
              onTitle={(title, updatedAt, hasUnconfirmedChanges) =>
                noteLocalPage(id, title, updatedAt, hasUnconfirmedChanges)
              }
            />
          )}
        </Show>
      </section>
    </main>
  );
}
