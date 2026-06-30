import { describe, expect, it } from "vitest";
import { PROJECT_ROOT_ENV, resolveProjectRoot } from "./config.js";

describe("resolveProjectRoot", () => {
  it("uses UNITY_MCP_PROJECT_ROOT when set", () => {
    expect(resolveProjectRoot({ [PROJECT_ROOT_ENV]: "/Users/me/MyGame" })).toBe("/Users/me/MyGame");
  });

  it("falls back to process.cwd() when unset or empty", () => {
    expect(resolveProjectRoot({})).toBe(process.cwd());
    expect(resolveProjectRoot({ [PROJECT_ROOT_ENV]: "" })).toBe(process.cwd());
  });
});
