import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Arch, UnityResolver } from "../resolver/index.js";
import { StateStore } from "../state/store.js";
import { ensureEditor } from "./ensure-editor.js";

/** A fake resolver with scriptable behavior, recording installEditor calls. */
function fakeResolver(over: Partial<UnityResolver> = {}): UnityResolver & { installs: string[] } {
  const installs: string[] = [];
  return {
    installs,
    detectArch: async () => "arm64" as Arch,
    findHub: async () => "/Applications/Unity Hub.app/Contents/MacOS/Unity Hub",
    findEditor: async () => null,
    verifyEditorPath: async () => true,
    installEditor: async (version: string) => {
      installs.push(version);
      return `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
    },
    ...over,
  };
}

describe("ensureEditor", () => {
  let root: string;
  let store: StateStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "umcp-ee-"));
    store = new StateStore(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("freezes a found editor and transitions to editor_ready without installing", async () => {
    const found = "/Applications/Unity/Hub/Editor/6000.0.72f1/Unity.app/Contents/MacOS/Unity";
    const resolver = fakeResolver({ findEditor: async () => found });

    const result = await ensureEditor(resolver, store, { unityVersion: "6000.0.72f1" });

    expect(result.installed).toBe(false);
    expect(result.editorPath).toBe(found);
    const state = await store.read();
    expect(state?.state).toBe("editor_ready");
    expect(state?.frozen).toEqual({ arch: true, editorPath: true, unityVersion: true });
    expect(resolver.installs).toEqual([]);
  });

  it("installs when no editor is found", async () => {
    const resolver = fakeResolver({ findEditor: async () => null });
    const result = await ensureEditor(resolver, store, { unityVersion: "6000.0.72f1" });
    expect(result.installed).toBe(true);
    expect(resolver.installs).toEqual(["6000.0.72f1"]);
    expect((await store.read())?.editorPath).toContain("6000.0.72f1");
  });

  it("honors a valid unityPath override (no find/install)", async () => {
    const custom = "/Volumes/Work/Unity/Unity.app/Contents/MacOS/Unity";
    const resolver = fakeResolver({
      verifyEditorPath: async () => true,
      findEditor: async () => null,
    });
    const result = await ensureEditor(resolver, store, {
      unityVersion: "6000.0.72f1",
      unityPath: custom,
    });
    expect(result.editorPath).toBe(custom);
    expect(resolver.installs).toEqual([]);
  });

  it("rejects an invalid unityPath override", async () => {
    const resolver = fakeResolver({ verifyEditorPath: async () => false });
    await expect(
      ensureEditor(resolver, store, { unityVersion: "6000.0.72f1", unityPath: "/nope/Unity" }),
    ).rejects.toThrow(/does not point at an editor/);
  });

  it("refuses to re-resolve a frozen editorPath to a different value", async () => {
    const a = "/Applications/Unity/Hub/Editor/6000.0.72f1/Unity.app/Contents/MacOS/Unity";
    await ensureEditor(fakeResolver({ findEditor: async () => a }), store, {
      unityVersion: "6000.0.72f1",
    });
    // A second resolve yielding a different path must hit the freeze guard.
    const b = "/somewhere/else/Unity";
    await expect(
      ensureEditor(fakeResolver({ findEditor: async () => b }), store, {
        unityVersion: "6000.0.72f1",
      }),
    ).rejects.toThrow(/frozen 'editorPath'/);
  });
});
