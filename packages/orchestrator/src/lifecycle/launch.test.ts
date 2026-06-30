import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BridgeClient } from "../bridge/client.js";
import { initialState } from "../state/schema.js";
import { StateStore, mergeFrozen } from "../state/store.js";
import { ProjectPathMismatchError } from "./create-project.js";
import type { EditorHandle, LaunchDeps } from "./launch.js";
import { launch, shutdown } from "./launch.js";

const WS_URL = "ws://127.0.0.1:8090/McpUnity";

/** A no-op bridge client for tests. */
function fakeClient(): BridgeClient & { closed: boolean } {
  const c = {
    closed: false,
    async request() {
      return {};
    },
    isOpen: () => !c.closed,
    close() {
      c.closed = true;
    },
  };
  return c;
}

/** A fake editor process; configurable liveness and captured log. */
function fakeHandle(opts?: { aliveFor?: number; log?: string }): EditorHandle & { kills: number } {
  let calls = 0;
  const handle = {
    kills: 0,
    isAlive() {
      calls += 1;
      return opts?.aliveFor === undefined ? true : calls <= opts.aliveFor;
    },
    kill() {
      handle.kills += 1;
    },
    capturedLog: () => opts?.log ?? "",
  };
  return handle;
}

/** A clock that advances by `step` ms on every read — makes timeouts deterministic. */
function fakeClock(step = 1000): () => number {
  let t = 0;
  return () => {
    t += step;
    return t;
  };
}

async function projectCreatedStore(root: string): Promise<StateStore> {
  const store = new StateStore(root);
  await store.write(
    mergeFrozen(
      { ...initialState(), state: "project_created" },
      { arch: "arm64", editorPath: "/Applications/Unity/.../Unity", projectPath: root },
      ["arch", "editorPath", "projectPath"],
    ),
  );
  return store;
}

function deps(
  over: Partial<LaunchDeps> & Pick<LaunchDeps, "startEditor" | "connectBridge">,
): LaunchDeps {
  return {
    wsUrl: WS_URL,
    handshakeTimeoutMs: 10_000,
    pollIntervalMs: 1,
    sleep: async () => {},
    now: fakeClock(1000),
    nowIso: () => "2026-06-30T00:00:00.000Z",
    ...over,
  };
}

describe("launch", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "umcp-launch-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("transitions to launched once the bridge handshake succeeds", async () => {
    const store = await projectCreatedStore(root);
    const handle = fakeHandle();
    let attempts = 0;
    const session = await launch(
      deps({
        startEditor: () => handle,
        connectBridge: async () => {
          attempts += 1;
          return attempts >= 3 ? fakeClient() : null; // server comes up on the 3rd poll
        },
      }),
      store,
      { projectPath: root },
      root,
    );

    expect(session.handle).toBe(handle);
    const state = await store.read();
    expect(state?.state).toBe("launched");
    expect(state?.lastHandshakeAt).toBe("2026-06-30T00:00:00.000Z");
  });

  it("fails fast with a license diagnostic if the editor exits before handshake", async () => {
    const store = await projectCreatedStore(root);
    const handle = fakeHandle({ aliveFor: 0, log: "No valid Unity Editor license found." });
    await expect(
      launch(
        deps({ startEditor: () => handle, connectBridge: async () => null }),
        store,
        { projectPath: root },
        root,
      ),
    ).rejects.toThrow(/no valid license for headless batchmode/i);
    expect((await store.read())?.state).toBe("project_created");
  });

  it("times out, kills the editor, and reports a G3-style diagnostic", async () => {
    const store = await projectCreatedStore(root);
    const handle = fakeHandle({ log: "...compiling..." });
    await expect(
      launch(
        deps({
          startEditor: () => handle,
          connectBridge: async () => null,
          handshakeTimeoutMs: 3_000,
        }),
        store,
        { projectPath: root },
        root,
      ),
    ).rejects.toThrow(/timed out/);
    expect(handle.kills).toBeGreaterThan(0);
    expect((await store.read())?.state).toBe("project_created");
  });

  it("rejects a projectPath that isn't the project root", async () => {
    const store = await projectCreatedStore(root);
    await expect(
      launch(
        deps({ startEditor: () => fakeHandle(), connectBridge: async () => fakeClient() }),
        store,
        { projectPath: "/elsewhere" },
        root,
      ),
    ).rejects.toBeInstanceOf(ProjectPathMismatchError);
  });
});

describe("shutdown", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "umcp-shutdown-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("kills the live editor and returns to project_created", async () => {
    const store = await projectCreatedStore(root);
    await store.write(
      mergeFrozen((await store.read()) ?? initialState(), { state: "launched" }, []),
    );
    const handle = fakeHandle();
    const client = fakeClient();
    const result = await shutdown({ handle, client, projectPath: root, wsUrl: WS_URL }, store);
    expect(result.killed).toBe(true);
    expect(handle.kills).toBe(1);
    expect(client.closed).toBe(true);
    expect((await store.read())?.state).toBe("project_created");
  });

  it("still transitions when no live process is held (post-restart)", async () => {
    const store = await projectCreatedStore(root);
    await store.write(
      mergeFrozen((await store.read()) ?? initialState(), { state: "launched" }, []),
    );
    const result = await shutdown(null, store);
    expect(result.killed).toBe(false);
    expect((await store.read())?.state).toBe("project_created");
  });
});
