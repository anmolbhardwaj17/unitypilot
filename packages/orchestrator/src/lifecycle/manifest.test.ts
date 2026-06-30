import { describe, expect, it } from "vitest";
import { bridgeFileRef, hasBridgeDependency, injectBridgeDependency } from "./manifest.js";

const NAME = "com.unitymcp.bridge";
const REF = bridgeFileRef("/repo/packages/bridge");

describe("bridgeFileRef", () => {
  it("prefixes a local package path with file:", () => {
    expect(bridgeFileRef("/repo/packages/bridge")).toBe("file:/repo/packages/bridge");
  });
});

describe("injectBridgeDependency", () => {
  it("adds the bridge to an existing dependencies map, preserving others", () => {
    const before = JSON.stringify({ dependencies: { "com.unity.ugui": "2.0.0" } });
    const after = JSON.parse(injectBridgeDependency(before, NAME, REF));
    expect(after.dependencies["com.unity.ugui"]).toBe("2.0.0");
    expect(after.dependencies[NAME]).toBe(REF);
  });

  it("creates dependencies when absent", () => {
    const after = JSON.parse(injectBridgeDependency("{}", NAME, REF));
    expect(after.dependencies[NAME]).toBe(REF);
  });

  it("is idempotent", () => {
    const once = injectBridgeDependency("{}", NAME, REF);
    const twice = injectBridgeDependency(once, NAME, REF);
    expect(twice).toBe(once);
    expect(hasBridgeDependency(twice, NAME, REF)).toBe(true);
  });

  it("throws on invalid JSON", () => {
    expect(() => injectBridgeDependency("{not json", NAME, REF)).toThrow(/not valid JSON/);
  });
});
