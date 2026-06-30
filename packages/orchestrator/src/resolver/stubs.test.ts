import { describe, expect, it } from "vitest";
import { LinuxResolver, WindowsResolver } from "./stubs.js";

describe("platform stubs (v1 is macOS only)", () => {
  it("Windows resolver throws NotImplemented on every method", async () => {
    const r = new WindowsResolver();
    await expect(r.detectArch()).rejects.toThrow(/Windows support is not implemented/);
    await expect(r.findHub()).rejects.toThrow(/not implemented/);
    await expect(r.findEditor("6000.0.30f1")).rejects.toThrow(/not implemented/);
    await expect(r.verifyEditorPath("/x")).rejects.toThrow(/not implemented/);
    await expect(r.installEditor("6000.0.30f1", "x64")).rejects.toThrow(/not implemented/);
  });

  it("Linux resolver throws NotImplemented", async () => {
    const r = new LinuxResolver();
    await expect(r.detectArch()).rejects.toThrow(/Linux support is not implemented/);
  });
});
