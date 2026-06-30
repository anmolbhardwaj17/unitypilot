import { describe, expect, it } from "vitest";
import {
  IllegalToolError,
  LIFECYCLE_STATES,
  applyTransition,
  assertToolLegal,
  isToolLegal,
  nextLifecycleTool,
} from "./machine.js";

describe("isToolLegal", () => {
  it("allows status in every state", () => {
    for (const state of LIFECYCLE_STATES) {
      expect(isToolLegal(state, "status")).toBe(true);
    }
  });

  it("encodes the SPEC §3 legality table", () => {
    expect(isToolLegal("none", "ensure_editor")).toBe(true);
    expect(isToolLegal("none", "create_project")).toBe(false);
    expect(isToolLegal("editor_ready", "create_project")).toBe(true);
    expect(isToolLegal("project_created", "launch")).toBe(true);
    expect(isToolLegal("launched", "shutdown")).toBe(true);
    expect(isToolLegal("busy", "shutdown")).toBe(false);
  });
});

describe("nextLifecycleTool", () => {
  it("points at the tool that advances each state", () => {
    expect(nextLifecycleTool("none")).toBe("ensure_editor");
    expect(nextLifecycleTool("editor_ready")).toBe("create_project");
    expect(nextLifecycleTool("project_created")).toBe("launch");
    expect(nextLifecycleTool("launched")).toBeNull();
    expect(nextLifecycleTool("busy")).toBeNull();
  });
});

describe("assertToolLegal", () => {
  it("passes silently for a legal tool", () => {
    expect(() => assertToolLegal("none", "ensure_editor")).not.toThrow();
  });

  it("throws a structured IllegalToolError naming the required tool", () => {
    try {
      assertToolLegal("none", "launch");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalToolError);
      const e = err as IllegalToolError;
      expect(e.currentState).toBe("none");
      expect(e.tool).toBe("launch");
      expect(e.requiredTool).toBe("ensure_editor");
      expect(e.message).toContain("ensure_editor");
    }
  });
});

describe("applyTransition", () => {
  it("walks the full happy path none → editor_ready → project_created → launched → project_created", () => {
    expect(applyTransition("none", "ensure_editor")).toBe("editor_ready");
    expect(applyTransition("editor_ready", "create_project")).toBe("project_created");
    expect(applyTransition("project_created", "launch")).toBe("launched");
    expect(applyTransition("launched", "shutdown")).toBe("project_created");
  });

  it("rejects an illegal transition", () => {
    expect(() => applyTransition("none", "launch")).toThrow(IllegalToolError);
  });
});
