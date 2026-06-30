import { describe, expect, it } from "vitest";
import { type ProjectState, initialState } from "../state/schema.js";
import { mergeFrozen } from "../state/store.js";
import { getStatus } from "./status.js";

describe("getStatus", () => {
  it("reports 'none' with ensure_editor as the next tool when no state exists", () => {
    expect(getStatus(null)).toEqual({
      state: "none",
      arch: null,
      unityVersion: null,
      editorPath: null,
      projectPath: null,
      bridgeVersion: null,
      frozen: [],
      nextTool: "ensure_editor",
      editorAlive: false,
      bridgeConnected: false,
      busy: false,
    });
  });

  it("surfaces the live editor/bridge/busy runtime overlay", () => {
    const result = getStatus(null, { editorAlive: true, bridgeConnected: true, busy: true });
    expect(result.editorAlive).toBe(true);
    expect(result.bridgeConnected).toBe(true);
    expect(result.busy).toBe(true);
  });

  it("reports frozen paths and the next tool from a real state", () => {
    const state: ProjectState = mergeFrozen(
      { ...initialState(), state: "editor_ready" },
      { arch: "arm64", unityVersion: "6000.0.72f1", editorPath: "/Applications/Unity/.../Unity" },
      ["arch", "unityVersion", "editorPath"],
    );
    const result = getStatus(state);
    expect(result.state).toBe("editor_ready");
    expect(result.arch).toBe("arm64");
    expect(result.editorPath).toBe("/Applications/Unity/.../Unity");
    expect(result.frozen.sort()).toEqual(["arch", "editorPath", "unityVersion"]);
    expect(result.nextTool).toBe("create_project");
  });
});
