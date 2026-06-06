import { expect, test } from "bun:test";

import { buildDraftSummaries } from "../src/stores/draftSummaries";

test("pending local title wins over newly linked server placeholder", () => {
  const [summary] = buildDraftSummaries(
    [
      {
        page_id: "draft-1",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        title: "Untitled",
        relationship: "creator",
      },
    ],
    [
      {
        page_id: "draft-1",
        created_at: "",
        updated_at: "2026-01-01T00:01:00.000Z",
        title: "Local title",
        hasUnconfirmedChanges: true,
      },
    ],
  );

  expect(summary.title).toBe("Local title");
  expect(summary.hasUnconfirmedChanges).toBe(true);
  expect(summary.source).toBe("merged");
});

test("fresh local Untitled is a real title, not a fallback miss", () => {
  const [summary] = buildDraftSummaries(
    [
      {
        page_id: "draft-1",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        title: "Old title",
        relationship: "creator",
      },
    ],
    [
      {
        page_id: "draft-1",
        created_at: "",
        updated_at: "2026-01-01T00:01:00.000Z",
        title: "Untitled",
      },
    ],
  );

  expect(summary.title).toBe("Untitled");
});

test("server page ids are placeholders, not display titles", () => {
  const [summary] = buildDraftSummaries(
    [
      {
        page_id: "draft-1",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        title: "draft-1",
        relationship: "creator",
      },
    ],
    [],
  );

  expect(summary.title).toBe("Untitled");
});
