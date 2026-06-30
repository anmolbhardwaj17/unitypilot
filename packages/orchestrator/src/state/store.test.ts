import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ProjectState, initialState } from "./schema.js";
import { FrozenViolationError, StateStore, mergeFrozen } from "./store.js";

describe("mergeFrozen (pure freeze semantics)", () => {
  it("applies updates and marks the named keys frozen", () => {
    const next = mergeFrozen(initialState(), { arch: "arm64", editorPath: "/x/Unity" }, [
      "arch",
      "editorPath",
    ]);
    expect(next.arch).toBe("arm64");
    expect(next.frozen).toEqual({ arch: true, editorPath: true });
  });

  it("is idempotent: re-writing the same frozen value is allowed", () => {
    const first = mergeFrozen(initialState(), { editorPath: "/x/Unity" }, ["editorPath"]);
    const again = mergeFrozen(first, { editorPath: "/x/Unity" }, ["editorPath"]);
    expect(again.editorPath).toBe("/x/Unity");
  });

  it("throws when a frozen value would change (SPEC §2 / G4)", () => {
    const frozen = mergeFrozen(initialState(), { editorPath: "/x/Unity" }, ["editorPath"]);
    expect(() => mergeFrozen(frozen, { editorPath: "/y/Unity" }, [])).toThrow(FrozenViolationError);
  });

  it("allows changing a value that was never frozen", () => {
    const a = mergeFrozen(initialState(), { unityVersion: "6000.0.72f1" }, []);
    const b = mergeFrozen(a, { unityVersion: "6000.4.2f1" }, []);
    expect(b.unityVersion).toBe("6000.4.2f1");
  });
});

describe("StateStore (disk round-trip + restart)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "unity-mcp-test-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns null before any project is initialized", async () => {
    expect(await new StateStore(root).read()).toBeNull();
  });

  it("persists and reloads state (survives a fresh store instance = process restart)", async () => {
    const written: ProjectState = mergeFrozen(
      { ...initialState(), state: "editor_ready" },
      { arch: "arm64", unityVersion: "6000.0.72f1", editorPath: "/Applications/.../Unity" },
      ["arch", "unityVersion", "editorPath"],
    );
    await new StateStore(root).write(written);

    // A brand-new store, as if the process restarted, reads the same state off disk.
    const reloaded = await new StateStore(root).read();
    expect(reloaded?.state).toBe("editor_ready");
    expect(reloaded?.editorPath).toBe("/Applications/.../Unity");
    expect(reloaded?.frozen).toEqual({ arch: true, unityVersion: true, editorPath: true });
  });
});
