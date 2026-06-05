/**
 * End-to-end smoke test for the authority. Drives the real client-side collab
 * plugin against a running `wrangler dev` (no DOM — ProseMirror state/transform
 * work headlessly). Run with: bun run dev (in one shell), then
 * `bun test/collab-roundtrip.test.ts`. Override the server location with
 * COLLAB_TEST_URL / COLLAB_TEST_HOST / COLLAB_TEST_PORT (see below).
 */
import { EditorState } from "prosemirror-state";
import {
  collab,
  initCollabState,
  sendableCommit,
  receiveCommitTransaction,
  getVersion,
  Commit,
} from "@stepwisehq/prosemirror-collab-commit/collab-commit";

import { schema } from "../shared/schema";

const ROOM = "smoke-" + Math.random().toString(36).slice(2, 8);

// Where the dev server lives is environment-specific, so don't bake it in.
// Point the test at any running server with COLLAB_TEST_URL (full ws[s]:// base,
// with or without a trailing /parties/... path), or tweak host/port piecemeal
// via COLLAB_TEST_HOST / COLLAB_TEST_PORT. Defaults match `bun run dev` (vite,
// which run-worker-firsts /parties/* to the Worker); use port 8787 for a
// standalone `wrangler dev`.
function serverBase(): string {
  const explicit = process.env.COLLAB_TEST_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = process.env.COLLAB_TEST_HOST ?? "127.0.0.1";
  const port = process.env.COLLAB_TEST_PORT ?? "5173";
  return `ws://${host}:${port}`;
}

const URL = `${serverBase()}/parties/document-server/${ROOM}`;

type ServerMessage =
  | { type: "init"; version: number; doc: any; schemaVersion: number }
  | { type: "commit"; commit: any }
  | { type: "error"; message: string; ref?: string };

function connect(): Promise<{
  ws: WebSocket;
  next: () => Promise<ServerMessage>;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const inbox: ServerMessage[] = [];
    let waiter: ((m: ServerMessage) => void) | null = null;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      if (waiter) {
        waiter(msg);
        waiter = null;
      } else inbox.push(msg);
    };
    ws.onerror = (e) => reject(e);
    ws.onopen = () =>
      resolve({
        ws,
        next: () =>
          new Promise<ServerMessage>((res) => {
            const queued = inbox.shift();
            if (queued) res(queued);
            else waiter = res;
          }),
      });
  });
}

function makeClient(version: number, doc: any) {
  let state = EditorState.create({ schema, plugins: [collab()] });
  state = state.apply(initCollabState(state, version, doc));
  return {
    get state() {
      return state;
    },
    type(text: string) {
      const tr = state.tr.insertText(text, state.doc.content.size - 1);
      state = state.apply(tr);
    },
    sendable() {
      return sendableCommit(state);
    },
    receive(commitJSON: any) {
      const commit = Commit.FromJSON(state.schema, commitJSON);
      state = state.apply(receiveCommitTransaction(state, commit));
    },
    text() {
      return state.doc.textContent;
    },
    version() {
      return getVersion(state);
    },
  };
}

const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error("❌ FAIL:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
};

async function main() {
  // Two clients join the same room.
  const a = await connect();
  const b = await connect();

  const aInit = await a.next();
  const bInit = await b.next();
  assert(aInit.type === "init" && aInit.version === 0, "A gets init at version 0");
  assert(bInit.type === "init" && bInit.version === 0, "B gets init at version 0");

  const clientA = makeClient((aInit as any).version, (aInit as any).doc);
  const clientB = makeClient((bInit as any).version, (bInit as any).doc);

  // A types and submits a commit.
  clientA.type("Hello");
  const commitA = clientA.sendable();
  assert(!!commitA, "A has a sendable commit");
  a.ws.send(JSON.stringify({ type: "commit", commit: commitA!.toJSON() }));

  // Both clients receive the broadcast.
  const aMsg1 = await a.next();
  const bMsg1 = await b.next();
  assert(aMsg1.type === "commit", "A receives commit broadcast (its own ack)");
  assert(bMsg1.type === "commit", "B receives commit broadcast");
  clientA.receive((aMsg1 as any).commit); // confirms A's pending steps by ref
  clientB.receive((bMsg1 as any).commit);

  assert(clientA.text() === "Hello", `A doc == "Hello" (got "${clientA.text()}")`);
  assert(clientB.text() === "Hello", `B doc == "Hello" (got "${clientB.text()}")`);
  assert(clientA.version() === 1, "A at version 1");
  assert(clientB.version() === 1, "B at version 1");

  // Concurrent edits: both type before either's commit is processed, both
  // built on version 1. The authority must rebase the second onto the first.
  clientA.type("A");
  clientB.type("B");
  const cA = clientA.sendable()!;
  const cB = clientB.sendable()!;
  assert(cA.version === 1 && cB.version === 1, "both commits built on base version 1");

  a.ws.send(JSON.stringify({ type: "commit", commit: cA.toJSON() }));
  // Deliver A's broadcast to both before B submits, mirroring real ordering.
  const r1a = await a.next();
  const r1b = await b.next();
  clientA.receive((r1a as any).commit);
  clientB.receive((r1b as any).commit);

  b.ws.send(JSON.stringify({ type: "commit", commit: cB.toJSON() }));
  const r2a = await a.next();
  const r2b = await b.next();
  clientA.receive((r2a as any).commit);
  clientB.receive((r2b as any).commit);

  assert(
    clientA.text() === clientB.text(),
    `clients converge (A="${clientA.text()}", B="${clientB.text()}")`,
  );
  assert(clientA.version() === 3 && clientB.version() === 3, "both at version 3");
  console.log(`\n✅ converged document: "${clientA.text()}"`);

  a.ws.close();
  b.ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
