import { Link } from "./marks/Link";
import { CodeBlock } from "./containers/CodeBlock";
import { Document } from "./basic/Document";
import { Dropcursor } from "./basic/Dropcursor";
import { HardBreak } from "./basic/HardBreak";
import { Highlight } from "./marks/Highlight";
import { HorizontalRule } from "./blocks/HorizontalRule";
import { Paragraph } from "./blocks/Paragraph";
import { Superscript } from "./marks/Superscript";
import { Typography } from "./basic/Replacements";
import { Blockquote } from "./containers/Blockquote";
import { Image } from "./blocks/Image";
import { Bold } from "./marks/Bold";
import { Code } from "./marks/Code";
import { Focus } from "./basic/Focus";
import { Gapcursor } from "./basic/Gapcursor";
import { Heading } from "./blocks/Heading";
import { Italic } from "./marks/Italic";
import { Placeholder } from "./basic/Placeholder";
import { Strike } from "./marks/Strike";
import { Text } from "./basic/Text";
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
