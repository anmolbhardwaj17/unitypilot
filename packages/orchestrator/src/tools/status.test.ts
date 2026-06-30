import { describe, expect, it } from "vitest";
import { getStatus } from "./status.js";

describe("getStatus (Phase 0)", () => {
  it("reports the initial lifecycle state", () => {
    expect(getStatus()).toEqual({ state: "none" });
  });
});
