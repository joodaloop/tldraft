import { expect, test } from "bun:test";
import { EditorState } from "prosemirror-state";

import { emptyDocJSON, schema } from "../shared/schema";
import { insertedRangesFromTransaction } from "../src/components/remoteInsertGlowExtension";

function docTextForRange(state: EditorState, range: { from: number; to: number }): string {
  return state.doc.textBetween(range.from, range.to, "");
}

test("remote insert glow ranges are mapped into the final transaction document", () => {
  let state = EditorState.create({ schema });
  state = state.apply(state.tr.replaceWith(0, state.doc.content.size, schema.nodeFromJSON(emptyDocJSON()).content));
  state = state.apply(state.tr.insertText("base", 1));

  const endOfTitle = state.doc.resolve(1).end();
  const tr = state.tr
    .insertText("X", endOfTitle)
    .insertText("Y", 1);

  state = state.apply(tr);

  const ranges = insertedRangesFromTransaction(tr);

  expect(ranges).toHaveLength(2);
  expect(ranges.map((range) => docTextForRange(state, range))).toEqual(["Y", "X"]);
});

test("remote insert glow includes replacement steps that insert content", () => {
  let state = EditorState.create({ schema });
  state = state.apply(state.tr.replaceWith(0, state.doc.content.size, schema.nodeFromJSON(emptyDocJSON()).content));

  const paragraph = schema.nodes.paragraph.create(null, schema.text("pasted"));
  const tr = state.tr.replaceWith(0, 2, paragraph);

  state = state.apply(tr);

  const ranges = insertedRangesFromTransaction(tr);

  expect(ranges).toHaveLength(1);
  expect(docTextForRange(state, ranges[0])).toBe("pasted");
});

test("remote insert glow can scan only remote maps while mapping through later maps", () => {
  let state = EditorState.create({ schema });
  state = state.apply(state.tr.replaceWith(0, state.doc.content.size, schema.nodeFromJSON(emptyDocJSON()).content));

  const tr = state.tr
    .insertText("local", 1)
    .insertText("remote", 1)
    .insertText("again", 1);

  state = state.apply(tr);

  const ranges = insertedRangesFromTransaction(tr, { from: 1, to: 2 });

  expect(ranges).toHaveLength(1);
  expect(docTextForRange(state, ranges[0])).toBe("remote");
});
