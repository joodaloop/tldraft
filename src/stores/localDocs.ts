import { z } from "zod";
import { Step } from "prosemirror-transform";
import type { NodeJSON } from "@stepwisehq/prosemirror-collab-commit/collab-commit";
import { schema } from "../../shared/schema";

// A best-effort offline cache of each room's latest doc, keyed by room. The
// editor restores from it on load, and the sidebar scans it to discover local
// drafts before the server list catches up.
const DB_NAME = "drafts";
const STORE = "docs";

export interface CachedDoc {
  /**
   * The schema version `doc` was authored under. A cache entry from a different
   * schema should be ignored before seeding it into the editor.
   */
  schemaVersion: number;
  /** The confirmed (server-acknowledged) doc, at `version`. */
  doc: NodeJSON;
  /** The collab version (the strictly increasing counter) `doc` is at. */
  version: number;
  /**
   * Local steps the server hasn't confirmed yet, as step JSON, in order.
   * Re-applied on restore so in-flight edits survive a reload.
   */
  unconfirmed: unknown[];
  /** ISO timestamp of the last genuine local doc edit. */
  updatedAt?: string;
  /**
   * True for a draft that was created locally while the document authority was
   * unreachable. Cleared once it reconnects and has no unconfirmed steps left.
   */
  offline?: boolean;
}

export interface LocalDocRecord {
  room: string;
  cached: CachedDoc;
  /**
   * The visible local doc: confirmed base plus unconfirmed steps where they can
   * be replayed. Use this for UI labels so offline edits do not disappear from
   * the sidebar while waiting for server confirmation.
   */
  visibleDoc: NodeJSON;
}

const cachedDocSchema = z.object({
  schemaVersion: z.number().int().finite(),
  doc: z.object({}).catchall(z.unknown()),
  version: z.number().int().finite(),
  unconfirmed: z.array(z.unknown()),
  // Optional: entries cached before this field existed still load.
  updatedAt: z.string().optional(),
  offline: z.boolean().optional(),
});

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCachedDoc(room: string): Promise<CachedDoc | null> {
  try {
    const db = await openDB();
    const cached = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(room);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const parsed = cachedDocSchema.safeParse(cached);
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // no IndexedDB / private mode - just skip the cache
  }
}

export async function saveCachedDoc(room: string, value: CachedDoc): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, room);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort; a failed write just means a colder reload next time
  }
}

export async function deleteCachedDoc(room: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(room);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

export async function scanCachedDocs(): Promise<LocalDocRecord[]> {
  try {
    const db = await openDB();
    const [keys, values] = await new Promise<[IDBValidKey[], unknown[]]>(
      (resolve, reject) => {
        const store = db.transaction(STORE, "readonly").objectStore(STORE);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        const tx = store.transaction;
        tx.oncomplete = () => resolve([keysReq.result, valsReq.result]);
        tx.onerror = () => reject(tx.error);
      },
    );

    const out: LocalDocRecord[] = [];
    keys.forEach((key, i) => {
      if (typeof key !== "string") return;
      const parsed = cachedDocSchema.safeParse(values[i]);
      if (parsed.success) {
        out.push({
          room: key,
          cached: parsed.data,
          visibleDoc: visibleDocFromCachedDoc(parsed.data),
        });
      }
    });
    return out;
  } catch {
    return []; // no IndexedDB / private mode - just no local drafts
  }
}

function visibleDocFromCachedDoc(cached: CachedDoc): NodeJSON {
  try {
    let doc = schema.nodeFromJSON(cached.doc);
    for (const stepJSON of cached.unconfirmed) {
      const result = Step.fromJSON(schema, stepJSON).apply(doc);
      if (!result.doc) return cached.doc;
      doc = result.doc;
    }
    return doc.toJSON() as NodeJSON;
  } catch {
    return cached.doc;
  }
}
