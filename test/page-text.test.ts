import { expect, test } from "bun:test";

import { displayTitle, TITLE_MAX } from "../shared/pageText";

test("displayTitle trims, falls back, and truncates draft titles", () => {
  expect(displayTitle("  A title  ")).toBe("A title");
  expect(displayTitle("   ")).toBe("Untitled");
  expect(displayTitle("x".repeat(TITLE_MAX + 1))).toBe("x".repeat(TITLE_MAX));
});
