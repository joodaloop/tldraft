import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export function handleBackspace(editor: Editor) {
  const { state, view } = editor;
  const { selection } = state;
  const { $from, empty } = selection;
  const { dispatch } = view;
  let tr = state.tr;

  if (!empty) {
    return false;
  }

  if ($from.node(-1).type.name == "doc") {
    // HANDLE BACKSPACE FROM OUTSIDE THE COLUMN CONTAINER
    if ($from.parentOffset !== 0 || $from.parent.type.name != "paragraph") {
      return false;
    }

    if ($from.before() == 0 && $from.parent.content.size == 0) {
      const tr = state.tr;
      tr.delete($from.before(), $from.after());
      dispatch(tr);
      return true;
    }

    // Resolve the position just before the current node
    const posBefore = $from.before();
    const nodeBefore = state.doc.resolve(posBefore).nodeBefore;

    // Check if the node before is our flexContainer
    if (nodeBefore?.type.name !== "flexContainer") {
      return false;
    }

    const lastColumn = nodeBefore.lastChild;
    const lastNodeInContainer = lastColumn?.lastChild;

    if (
      (lastNodeInContainer && lastNodeInContainer.content.size === 0) ||
      $from.parent.content.size == 0
    ) {
      return false;
    }

    const paragraphToMove = $from.parent;
    const insertPos = posBefore - 2;

    tr.delete($from.before(), $from.after());
    tr.insert(insertPos, paragraphToMove);
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));

    dispatch(tr);

    return true;
  }

  const col = $from.node(-1);
  const container = $from.node(-2);

  if (container?.type.name !== "flexContainer") {
    return false;
  }

  // Case 2: At the start of the FIRST column
  else if (
    col === container.firstChild &&
    $from.parent === col.firstChild &&
    $from.parentOffset === 0
  ) {
    const firstCol = container.firstChild;
    const secondCol = container.childCount > 1 ? container.child(1) : null;

    // Condition: Are both columns empty? (i.e., contain one empty paragraph each)
    if (
      container.childCount === 2 &&
      firstCol.childCount === 1 &&
      secondCol &&
      secondCol.childCount === 1 &&
      secondCol.firstChild.content.size === 0
    ) {
      // Both are empty, so delete the entire flexContainer
      const posBeforeContainer = $from.before(-2);

      // If the container is the very first node in the document or if it has one child with content
      // if (posBeforeContainer === 0 || firstCol.firstChild.content.size > 0) {
      if (true) {
        // ...replace it with a new empty paragraph to keep the doc valid.
        const type = state.schema.nodes.paragraph;
        if (!type) return false; // Safety check

        tr.delete(
          posBeforeContainer,
          posBeforeContainer + container.nodeSize,
        ).insert(posBeforeContainer, type.create(null, $from.parent.content));

        // Set selection inside the new paragraph
        tr.setSelection(TextSelection.create(tr.doc, posBeforeContainer + 1));
      } else {
        // Otherwise, just delete it and move the cursor to its start position.
        tr.delete(posBeforeContainer, posBeforeContainer + container.nodeSize);
        tr.setSelection(TextSelection.create(tr.doc, posBeforeContainer - 1));
      }

      view.dispatch(tr);
      return true;
      // const tr = state.tr.delete(
      //   posBeforeContainer,
      //   posBeforeContainer + container.nodeSize,
      // );
      // tr.setSelection(TextSelection.create(tr.doc, posBeforeContainer - 1));
      // view.dispatch(tr);
      // return true;
    } else {
      const posBeforeContainer = $from.before(-2);
      const nodeBefore = state.doc.resolve(posBeforeContainer).nodeBefore;

      if (!nodeBefore || !nodeBefore.isTextblock) {
        return false;
      }

      if ($from.parent.type.name != "paragraph") return false;

      const nodeToMove = $from.parent;
      const tr = state.tr;
      const offset = nodeToMove.content.size;

      tr.insert(posBeforeContainer - 1, nodeToMove.content);
      tr.delete($from.before() + offset, $from.after() + offset);
      tr.setSelection(TextSelection.create(tr.doc, posBeforeContainer - 1));

      view.dispatch(tr);
      return true;
    }
  }
  // Case 2: At the start of the SECOND column
  else if (
    container.childCount > 1 &&
    col === container.child(1) &&
    $from.parent === col.firstChild &&
    $from.parentOffset === 0
  ) {
    const firstCol = container.firstChild;
    const lastNodeInFirstCol = firstCol.lastChild;
    let merge = false;

    // We can only merge if the target node is a textblock
    if (
      (lastNodeInFirstCol &&
        lastNodeInFirstCol.isTextblock &&
        lastNodeInFirstCol.content.size == 0) ||
      $from.parent.content.size == 0
    ) {
      merge = true;
    }

    if (merge) {
      const nodeToMerge = $from.parent;
      const containerPos = $from.start(-2);

      // Calculate the position just inside the end of the last node in the first column
      const joinPos = containerPos + 1 + firstCol.content.size - 1;
      const offset = nodeToMerge.content.size;

      const tr = state.tr
        // Insert the content of the current node at the join position
        .insert(joinPos, nodeToMerge.content)
        // Delete the original (now empty) node
        .delete($from.before() + offset, $from.after() + offset);

      // Set the cursor to the join point
      tr.setSelection(TextSelection.create(tr.doc, joinPos));

      view.dispatch(tr);
      return true;
    } else {
      const nodeToMove = $from.parent;
      const containerPos = $from.start(-2);
      const firstColPos = containerPos + 1;
      const insertPos = firstColPos + firstCol.content.size;
      const tr = state.tr
        .delete($from.before(), $from.after())
        .insert(insertPos, nodeToMove);
      tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
      view.dispatch(tr);
      return true;
    }
  }

  return false;
}
