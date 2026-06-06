import { z } from "zod";
import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";

export const nodeJSONSchema = z.custom<NodeJSON>(
  (value) => !!value && typeof value === "object" && !Array.isArray(value),
);

export const draftRelationshipSchema = z.enum(["opened", "creator"]);
export type DraftRelationship = z.infer<typeof draftRelationshipSchema>;

export const cachedDocSchema = z.object({
  schemaVersion: z.number().int().finite(),
  doc: nodeJSONSchema,
  version: z.number().int().finite(),
  unconfirmed: z.array(z.unknown()),
  // Optional: entries cached before this field existed still load.
  updatedAt: z.string().optional(),
  offline: z.boolean().optional(),
});
export type CachedDoc = z.infer<typeof cachedDocSchema>;

export const serverDraftRowSchema = z.object({
  page_id: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  title: z.string().optional(),
  relationship: draftRelationshipSchema.optional(),
  offline: z.boolean().optional(),
});
export type ServerDraftRow = z.infer<typeof serverDraftRowSchema>;

export const serverDraftRowsSchema = z.array(serverDraftRowSchema);

export const localDraftRowSchema = z.object({
  page_id: z.string(),
  created_at: z.literal(""),
  updated_at: z.string().optional(),
  title: z.string().optional(),
  offline: z.boolean().optional(),
});
export type LocalDraftRow = z.infer<typeof localDraftRowSchema>;

export const draftSummarySchema = z.object({
  id: z.string(),
  page_id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  relationship: draftRelationshipSchema.optional(),
  offline: z.boolean(),
  source: z.enum(["server", "local", "merged"]),
});
export type DraftSummary = z.infer<typeof draftSummarySchema>;
