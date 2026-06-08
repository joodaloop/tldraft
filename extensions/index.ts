import { Link } from "./marks/Link";
import { CodeBlock } from "./containers/CodeBlock";
import { Markdown } from "@tiptap/markdown";
import { Document } from "./basic/Document";
import { Dropcursor } from "@tiptap/extension-dropcursor";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Highlight } from "./marks/Highlight";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { Paragraph } from "./blocks/Paragraph";
import { Superscript } from "./marks/Superscript";
import { Typography } from "./basic/Replacements";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Image } from "./blocks/Image";
import { Bold } from "@tiptap/extension-bold";
import { Code } from "@tiptap/extension-code";
import { Focus } from "./basic/Focus";
import { Gapcursor } from "@tiptap/extension-gapcursor";
import { Heading } from "./blocks/Heading";
import { Italic } from "@tiptap/extension-italic";
import { Placeholder } from "./basic/Placeholder";
import { PasteFromMarkdown } from "./basic/PasteFromMarkdown";
import { Strike } from "@tiptap/extension-strike";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "./basic/UndoRedo";
import { TextAlign } from "./blocks/AlignText";
import { ListKit } from "./list";
import { CopyOrCutWithEmptySelection } from "./blocks/CopyOrCut";
import { Rubricate } from "./marks/Rubricate";
import { Muted } from "./marks/Muted";
import { ColumnContainer } from "./containers/columns/Container";
import { Column } from "./containers/columns/Column";
import { Section } from "./containers/Section";
import { NoMargin } from "./blocks/NoMargin";

export const allExtensions = [
  Blockquote,
  Bold,
  Code,
  CodeBlock,
  ColumnContainer,
  Column,
  CopyOrCutWithEmptySelection,
  Document,
  Dropcursor,
  Focus,
  Gapcursor,
  HardBreak,
  Heading,
  Highlight,
  HorizontalRule,
  Image,
  Italic,
  Link,
  Markdown,
  // UniqueID.configure({
  //   types: ["heading", "paragraph"],
  //   generateID: () => externalId(),
  //   filterTransaction: (transaction) => !isChangeOrigin(transaction),
  // }),
  ListKit.configure({
    taskItem: {
      nested: true,
    },
  }),
  Muted,
  NoMargin.configure({
    types: ["paragraph", "heading", "horizontalRule"],
  }),
  Paragraph,
  PasteFromMarkdown,
  Placeholder.configure({
    // Show the hint on every empty block, not just the focused one, so a blank
    // draft surfaces both the title and the body placeholder at once.
    showOnlyCurrent: false,
    placeholder: ({ node }) => (node.type.name === "heading" ? "Untitled" : ""),
  }),
  Rubricate,
  Section,
  // Selection,
  Strike,
  Superscript,
  Text,
  TextAlign.configure({
    types: ["heading", "paragraph", "listItem"],
  }),
  Typography,
  UndoRedo,
];
