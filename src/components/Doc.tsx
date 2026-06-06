import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { startDraftSession, type DocStatus } from "./draftSession";

import "prosemirror-view/style/prosemirror.css";

export type { DocStatus };

export interface DocProps {
  /** Document id — becomes the Durable Object room name. */
  room: string;
  /**
   * Worker host (`host:port`, no protocol). Defaults to the local
   * `wrangler dev` in dev and the current origin in production.
   */
  host?: string;
  class?: string;
  /** Notified whenever the connection status changes. */
  onStatus?: (status: DocStatus) => void;
  /**
   * Notified with the doc's display title (its first non-empty line, or
   * "Untitled") on seed and whenever it changes — lets the sidebar list this
   * draft live, before it's ever saved.
   */
  onTitle?: (title: string, updatedAt?: string, offline?: boolean) => void;
}

export default function Doc(props: DocProps): JSX.Element {
  const [status, setStatus] = createSignal<DocStatus>("connecting");
  const [ready, setReady] = createSignal(false);
  let mount!: HTMLDivElement;

  const setDocStatus = (next: DocStatus) => {
    setStatus(next);
    props.onStatus?.(next);
  };

  onMount(() => {
    const stop = startDraftSession({
      room: props.room,
      host: props.host,
      mount,
      onStatus: setDocStatus,
      onReady: setReady,
      onTitle: props.onTitle,
    });
    onCleanup(stop);
  });

  return (
    <div
      ref={mount}
      class={props.class}
      data-doc-status={status()}
      data-doc-ready={ready()}
      style={{ visibility: ready() ? "visible" : "hidden" }}
    />
  );
}
