import { describe, expect, test } from "bun:test";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import {
  Commit,
  collab,
  initCollabState,
  sendableCommit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { receiveRemoteCommitTransaction } from "../src/components/collabExtension";
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
});
