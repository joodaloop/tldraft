import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { startDraftSession, type DocStatus } from "./draftSession";
import type { PresencePeer } from "../../worker/protocol";

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
   * Notified with the doc's display title and whether it has local changes
   * awaiting server confirmation.
   */
  onTitle?: (
    title: string,
    updatedAt?: string,
    hasUnconfirmedChanges?: boolean,
  ) => void;
  username?: string;
  onPresence?: (peers: PresencePeer[]) => void;
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
      getUsername: () => props.username ?? "",
      onPresence: props.onPresence,
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
