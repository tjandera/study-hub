import type { Editor } from "@tiptap/react";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";

export type BlockContext = {
  depth: number;
  index: number;
  from: number;
  to: number;
  node: PmNode;
  parent: PmNode;
  parentPos: number;
  isDoc: boolean;
};

export function getBlockContext(
  state: EditorState,
  pos?: number,
): BlockContext | null {
  const $from =
    pos === undefined ? state.selection.$from : state.doc.resolve(pos);
  if ($from.depth === 0) {
    if (state.doc.childCount === 0) return null;
    const node = state.doc.child(0);
    return {
      depth: 1,
      index: 0,
      from: 0,
      to: node.nodeSize,
      node,
      parent: state.doc,
      parentPos: 0,
      isDoc: true,
    };
  }
  let depth = 1;
  for (let d = $from.depth; d > 0; d -= 1) {
    const name = $from.node(d).type.name;
    if (name === "listItem" || name === "taskItem") {
      depth = d;
      break;
    }
    if (d === 1) depth = 1;
  }
  const node = $from.node(depth);
  const parent = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const from = $from.before(depth);
  return {
    depth,
    index,
    from,
    to: from + node.nodeSize,
    node,
    parent,
    parentPos: depth === 1 ? 0 : $from.before(depth - 1),
    isDoc: depth === 1,
  };
}

export function getTopBlockByIndex(
  state: EditorState,
  index: number,
): BlockContext | null {
  if (index < 0 || index >= state.doc.childCount) return null;
  const node = state.doc.child(index);
  let from = 0;
  for (let i = 0; i < index; i += 1) from += state.doc.child(i).nodeSize;
  return {
    depth: 1,
    index,
    from,
    to: from + node.nodeSize,
    node,
    parent: state.doc,
    parentPos: 0,
    isDoc: true,
  };
}

export function topBlockIndexAt(state: EditorState, pos: number) {
  const clamped = Math.max(0, Math.min(pos, state.doc.content.size));
  const $pos = state.doc.resolve(clamped);
  if ($pos.depth >= 1) return $pos.index(0);
  if (clamped >= state.doc.content.size) {
    return Math.max(0, state.doc.childCount - 1);
  }
  return 0;
}

export function moveBlockToIndex(
  editor: Editor,
  ctx: BlockContext,
  toIndex: number,
) {
  if (toIndex === ctx.index) return false;
  if (toIndex < 0 || toIndex >= ctx.parent.childCount) return false;

  const { state } = editor;
  const node = ctx.node;
  const tr = state.tr.delete(ctx.from, ctx.to);
  const dest = toIndex;

  let insert = 0;
  if (ctx.isDoc) {
    for (let i = 0; i < dest; i += 1) insert += tr.doc.child(i).nodeSize;
  } else {
    const mappedParentPos = tr.mapping.map(ctx.parentPos);
    const parent = tr.doc.nodeAt(mappedParentPos);
    if (!parent) return false;
    insert = mappedParentPos + 1;
    for (let i = 0; i < dest; i += 1) insert += parent.child(i).nodeSize;
  }

  tr.insert(insert, node);
  const sel = Math.min(insert + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(sel)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function moveBlock(editor: Editor, direction: -1 | 1) {
  const ctx = getBlockContext(editor.state);
  if (!ctx) return false;
  return moveBlockToIndex(editor, ctx, ctx.index + direction);
}

export function duplicateBlock(editor: Editor) {
  const ctx = getBlockContext(editor.state);
  if (!ctx) return false;
  const json = ctx.node.toJSON();
  editor.chain().insertContentAt(ctx.to, json).run();
  return true;
}

export function deleteBlock(editor: Editor) {
  const ctx = getBlockContext(editor.state);
  if (!ctx) return false;
  if (ctx.isDoc && ctx.parent.childCount === 1) {
    editor.chain().setContent("<p></p>").run();
    return true;
  }
  editor.chain().deleteRange({ from: ctx.from, to: ctx.to }).run();
  return true;
}

export function insertBlockBelow(editor: Editor) {
  const ctx = getBlockContext(editor.state);
  if (!ctx) return false;
  editor
    .chain()
    .insertContentAt(ctx.to, { type: "paragraph" })
    .focus()
    .run();
  return true;
}
