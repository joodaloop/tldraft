import { useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import Doc, { type DocStatus } from "../components/Doc";
import { apiFetch } from "../stores/auth";
import { usePages } from "../stores/pages";

const DEFAULT_TOP_MESSAGE = "Share the link to this page to collaborate in real time (no live cursors yet).";

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
        <div class="flex justify-center gap-3">
          <button
            type="button"
            class="px-3 py-1.5 rounded-sm border disabled:opacity-40"
            disabled={props.deleting}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-sm border border-red-700 text-red-700 disabled:opacity-40"
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
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [temporaryTopMessage, setTemporaryTopMessage] = createSignal<string | null>(null);
  let topMessageTimer: ReturnType<typeof setTimeout> | undefined;

  const activePage = createMemo(() => pages().find((page) => page.page_id === params.id));
  const hasOfflineChanges = () =>
    (status() === "offline" || status() === "halted") && (activePage()?.hasUnconfirmedChanges ?? false);
  const defaultTopMessage = () => (hasOfflineChanges() ? "This page has unsaved changes." : DEFAULT_TOP_MESSAGE);
  const topMessage = () => temporaryTopMessage() ?? defaultTopMessage();
  const topMessageIsAlert = () => temporaryTopMessage() !== null || hasOfflineChanges();
  const forgetsOnly = () => activePage()?.relationship !== "creator";
  const actionLabel = () => (forgetsOnly() ? "Forget" : "Delete");
  const actionProgressLabel = () => (forgetsOnly() ? "Forgetting..." : "Deleting...");
  const actionError = () => `Could not ${forgetsOnly() ? "forget" : "delete"} this draft.`;

  const showTemporaryMessage = (message: string) => {
    if (topMessageTimer) clearTimeout(topMessageTimer);
    setTemporaryTopMessage(message);
    topMessageTimer = setTimeout(() => {
      setTemporaryTopMessage(null);
      topMessageTimer = undefined;
    }, 3000);
  };

  const askToDelete = () => {
    if (!params.id || deleting()) return;
    if (topMessageTimer) clearTimeout(topMessageTimer);
    topMessageTimer = undefined;
    setTemporaryTopMessage(null);
    setConfirmingDelete(true);
  };

  const deleteDraft = async () => {
    const id = params.id;
    if (!id || deleting()) return;

    setDeleting(true);

    try {
      const res = await apiFetch(`/api/page/delete/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          await forgetLocalPage(id);
          navigate("/", { replace: true });
          return;
        }

        setDeleting(false);
        setConfirmingDelete(false);
        showTemporaryMessage(actionError());
        return;
      }

      await forgetLocalPage(id);
      navigate("/", { replace: true });
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
      showTemporaryMessage(actionError());
    }
  };

  onCleanup(() => {
    if (topMessageTimer) clearTimeout(topMessageTimer);
  });

  return (
    <main class="w-full relative">
      <section class="mx-auto w-full max-w-4xl py-24">
        <div
          class="hidden lg:block absolute top-3 left-0 text-center w-full text-sm opacity-30 px-8"
          classList={{ "text-red-800 opacity-100": topMessageIsAlert() }}
          role="status"
        >
          {topMessage()}
        </div>
        <div class="absolute top-3 right-4 z-10 flex items-center gap-3 text-sm">
          <button
            type="button"
            class="opacity-40 hover:opacity-100 disabled:opacity-30"
            disabled={confirmingDelete() || deleting()}
            onClick={askToDelete}
          >
            {deleting() ? actionProgressLabel() : actionLabel()}
          </button>
        </div>
        <Show when={confirmingDelete() || deleting()}>
          <DeleteConfirmation
            deleting={deleting()}
            forgetsOnly={forgetsOnly()}
            progressLabel={actionProgressLabel()}
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={() => void deleteDraft()}
          />
        </Show>
        <Show when={!confirmingDelete() && !deleting() && params.id} keyed>
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
    </main>
  );
}
