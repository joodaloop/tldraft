import { describe, expect, test } from "bun:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  Commit,
  collab,
  initCollabState,
  sendableCommit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { receiveRemoteCommitTransaction } from "../src/components/collabExtension";
import {
  presenceKey,
  mapRemotePresenceTransaction,
  presencePlugin,
  setRemotePresenceTransaction,
} from "../src/components/presenceExtension";
import { emptyDocJSON, schema } from "../shared/schema";

function makeClient() {
  let state = EditorState.create({ schema, plugins: [collab()] });
  state = state.apply(initCollabState(state, 0, emptyDocJSON()));

  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  };
}

function expectPeerCursor(
  state: EditorState,
  clientId: string,
  expected: { pos: number; version?: number },
) {
  const peer = presenceKey.getState(state)?.peers.get(clientId);
  expect(peer?.selection?.anchor.pos).toBe(expected.pos);
  expect(peer?.selection?.head.pos).toBe(expected.pos);
  if (expected.version !== undefined) {
    expect(peer?.selection?.anchor.version).toBe(expected.version);
    expect(peer?.selection?.head.version).toBe(expected.version);
  }
}

describe("remote collab selection mapping", () => {
  test("keeps a co-located local cursor before incoming inserted content", () => {
    const author = makeClient();
    const receiver = makeClient();
    const sharedCursorPos = receiver.state.doc.content.size - 1;

    receiver.dispatch(
      receiver.state.tr.setSelection(
        TextSelection.create(receiver.state.doc, sharedCursorPos),
      ),
    );
    author.dispatch(author.state.tr.insertText("x", sharedCursorPos));

    const commit = sendableCommit(author.state);
    expect(commit).toBeTruthy();
    const appliedCommit = new Commit(1, commit!.ref, commit!.steps);

    receiver.dispatch(receiveRemoteCommitTransaction(receiver.state, appliedCommit));

    expect(receiver.state.doc.textContent).toBe("x");
    expect(receiver.state.selection.from).toBe(sharedCursorPos);
    expect(receiver.state.selection.to).toBe(sharedCursorPos);
  });

  test("maps a stored remote cursor through incoming document changes", () => {
    let state = EditorState.create({
      schema,
      plugins: [collab(), presencePlugin()],
    });
    state = state.apply(initCollabState(state, 0, emptyDocJSON()));

    const cursorPos = state.doc.content.size - 1;
    state = state.apply(
      setRemotePresenceTransaction(
        state,
        [
          {
            clientId: "peer-1",
            username: "Ada",
            color: "#2563eb",
            version: 0,
            selection: { anchor: cursorPos, head: cursorPos },
          },
        ],
        "self",
        false,
        0,
      ),
    );

    state = state.apply(mapRemotePresenceTransaction(state.tr.insertText("x", cursorPos), 1));

    expectPeerCursor(state, "peer-1", { pos: cursorPos + 1, version: 1 });
  });

  test("does not rewind a cursor already mapped through a newer document version", () => {
    let state = EditorState.create({
      schema,
      plugins: [collab(), presencePlugin()],
    });
    state = state.apply(initCollabState(state, 0, emptyDocJSON()));

    const cursorPos = state.doc.content.size - 1;
    const stalePeer = {
      clientId: "peer-1",
      username: "Ada",
      color: "#2563eb",
      version: 0,
      selection: { anchor: cursorPos, head: cursorPos },
    };

    state = state.apply(setRemotePresenceTransaction(state, [stalePeer], "self", false, 0));
    state = state.apply(mapRemotePresenceTransaction(state.tr.insertText("x", cursorPos), 1));
    state = state.apply(setRemotePresenceTransaction(state, [stalePeer], "self", false, 1));

    expectPeerCursor(state, "peer-1", { pos: cursorPos + 1, version: 1 });
  });

  test("stamps mapped cursor versions through own commit acknowledgements", () => {
    let state = EditorState.create({
      schema,
      plugins: [collab(), presencePlugin()],
    });
    state = state.apply(initCollabState(state, 0, emptyDocJSON()));

    const cursorPos = state.doc.content.size - 1;
    const stalePeer = {
      clientId: "peer-1",
      username: "Ada",
      color: "#2563eb",
      version: 0,
      selection: { anchor: cursorPos, head: cursorPos },
    };

    state = state.apply(setRemotePresenceTransaction(state, [stalePeer], "self", false, 0));
    state = state.apply(state.tr.insertText("x", cursorPos));

    const commit = sendableCommit(state);
    expect(commit).toBeTruthy();
    const acknowledged = new Commit(1, commit!.ref, commit!.steps);
    state = state.apply(
      mapRemotePresenceTransaction(receiveRemoteCommitTransaction(state, acknowledged), acknowledged.version),
    );
    state = state.apply(setRemotePresenceTransaction(state, [stalePeer], "self", false, 1));

    expectPeerCursor(state, "peer-1", { pos: cursorPos + 1, version: 1 });
  });

  test("ignores presence from a future document version until the doc catches up", () => {
    let state = EditorState.create({
      schema,
      plugins: [collab(), presencePlugin()],
    });
    state = state.apply(initCollabState(state, 0, emptyDocJSON()));

    const cursorPos = state.doc.content.size - 1;
    state = state.apply(
      setRemotePresenceTransaction(
        state,
        [
          {
            clientId: "peer-1",
            username: "Ada",
            color: "#2563eb",
            version: 0,
            selection: { anchor: cursorPos, head: cursorPos },
          },
        ],
        "self",
        false,
        0,
      ),
    );
    state = state.apply(
      setRemotePresenceTransaction(
        state,
        [
          {
            clientId: "peer-1",
            username: "Ada",
            color: "#2563eb",
            version: 2,
            selection: { anchor: cursorPos + 10, head: cursorPos + 10 },
          },
        ],
        "self",
        false,
        0,
      ),
    );

    expectPeerCursor(state, "peer-1", { pos: cursorPos, version: 0 });
  });
});
