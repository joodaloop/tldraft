import { expect, test } from "bun:test";

import { buildDraftSummaries } from "../src/stores/draftSummaries";

test("offline local title wins over newly linked server placeholder", () => {
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
        offline: true,
      },
    ],
  );

  expect(summary.title).toBe("Local title");
  expect(summary.offline).toBe(true);
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
