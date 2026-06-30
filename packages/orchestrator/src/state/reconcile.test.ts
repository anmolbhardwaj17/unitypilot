import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Mutex } from "../bridge/mutex.js";
import type { ToolContext } from "../tools/context.js";
import { getEffectiveState } from "./reconcile.js";
import { initialState } from "./schema.js";
import { StateStore, mergeFrozen } from "./store.js";

function ctxWith(store: StateStore, live: boolean | null): ToolContext {
  const session =
    live === null ? { current: null } : { current: { client: { isOpen: () => live } } as never };
  return { store, session, bridgeMutex: new Mutex() };
}

describe("getEffectiveState (resume reconcile)", () => {
  let root: string;
  let store: StateStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "umcp-reconcile-"));
    store = new StateStore(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns 'none' when no state file exists", async () => {
    expect(await getEffectiveState(ctxWith(store, null))).toBe("none");
  });

  it("demotes a stale 'launched' (no live connection) to 'project_created' and persists it", async () => {
    await store.write(mergeFrozen(initialState(), { state: "launched" }, []));
    expect(await getEffectiveState(ctxWith(store, null))).toBe("project_created");
    // persisted, so a later read agrees
    expect((await store.read())?.state).toBe("project_created");
  });

  it("keeps 'launched' when the bridge connection is live", async () => {
    await store.write(mergeFrozen(initialState(), { state: "launched" }, []));
    expect(await getEffectiveState(ctxWith(store, true))).toBe("launched");
  });

  it("leaves non-launched states untouched", async () => {
    await store.write(mergeFrozen(initialState(), { state: "editor_ready" }, []));
    expect(await getEffectiveState(ctxWith(store, null))).toBe("editor_ready");
  });
});
