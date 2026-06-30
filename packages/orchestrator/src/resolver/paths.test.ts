import { describe, expect, it } from "vitest";
import {
  EDITORS_ROOT,
  buildHubInstallArgs,
  editorBinaryPath,
  hubArch,
  normalizeArch,
} from "./paths.js";

describe("normalizeArch", () => {
  it("maps uname arm64 to arm64", () => {
    expect(normalizeArch("arm64")).toBe("arm64");
  });
  it("maps uname x86_64 to x64", () => {
    expect(normalizeArch("x86_64")).toBe("x64");
  });
  it("tolerates trailing whitespace/newlines from uname", () => {
    expect(normalizeArch("arm64\n")).toBe("arm64");
  });
  it("throws on anything unexpected rather than guessing", () => {
    expect(() => normalizeArch("i386")).toThrow(/Unsupported architecture/);
  });
});

describe("editorBinaryPath", () => {
  it("builds the Hub-managed editor binary path for a version", () => {
    expect(editorBinaryPath("6000.0.30f1")).toBe(
      `${EDITORS_ROOT}/6000.0.30f1/Unity.app/Contents/MacOS/Unity`,
    );
  });
});

describe("hubArch", () => {
  it("passes arm64 through", () => {
    expect(hubArch("arm64")).toBe("arm64");
  });
  it("translates x64 to the Hub's x86_64 token", () => {
    expect(hubArch("x64")).toBe("x86_64");
  });
});

describe("buildHubInstallArgs", () => {
  it("puts -- before --headless and the Hub install args", () => {
    expect(buildHubInstallArgs("6000.0.30f1", "arm64")).toEqual([
      "--",
      "--headless",
      "install",
      "--version",
      "6000.0.30f1",
      "--architecture",
      "arm64",
    ]);
  });
  it("translates arch and appends an optional changeset", () => {
    expect(buildHubInstallArgs("6000.0.30f1", "x64", "abc123")).toEqual([
      "--",
      "--headless",
      "install",
      "--version",
      "6000.0.30f1",
      "--architecture",
      "x86_64",
      "--changeset",
      "abc123",
    ]);
  });
});
