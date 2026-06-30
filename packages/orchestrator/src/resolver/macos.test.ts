import { describe, expect, it } from "vitest";
import { MacOsResolver } from "./macos.js";
import { HUB_CLI_PATH, editorBinaryPath } from "./paths.js";
import type { ExecResult, SystemProbe } from "./types.js";

/** A fully in-memory {@link SystemProbe} so no test touches the real machine. */
class FakeProbe implements SystemProbe {
  existing: Set<string>;
  execHandler: (command: string, args: string[]) => ExecResult;
  calls: { command: string; args: string[] }[] = [];

  constructor(opts?: {
    existing?: string[];
    exec?: (command: string, args: string[]) => ExecResult;
  }) {
    this.existing = new Set(opts?.existing ?? []);
    this.execHandler = opts?.exec ?? (() => ({ stdout: "", stderr: "", code: 0 }));
  }

  async pathExists(path: string): Promise<boolean> {
    return this.existing.has(path);
  }

  async exec(command: string, args: string[]): Promise<ExecResult> {
    this.calls.push({ command, args });
    return this.execHandler(command, args);
  }
}

const VERSION = "6000.0.30f1";

describe("MacOsResolver.detectArch", () => {
  it("returns arm64 from uname", async () => {
    const r = new MacOsResolver(
      new FakeProbe({ exec: () => ({ stdout: "arm64\n", stderr: "", code: 0 }) }),
    );
    expect(await r.detectArch()).toBe("arm64");
  });
  it("returns x64 from uname x86_64", async () => {
    const r = new MacOsResolver(
      new FakeProbe({ exec: () => ({ stdout: "x86_64\n", stderr: "", code: 0 }) }),
    );
    expect(await r.detectArch()).toBe("x64");
  });
  it("throws if uname itself fails", async () => {
    const r = new MacOsResolver(
      new FakeProbe({ exec: () => ({ stdout: "", stderr: "boom", code: 1 }) }),
    );
    await expect(r.detectArch()).rejects.toThrow(/uname/);
  });
});

describe("MacOsResolver.findHub", () => {
  it("returns the CLI path when the Hub binary exists", async () => {
    const r = new MacOsResolver(new FakeProbe({ existing: [HUB_CLI_PATH] }));
    expect(await r.findHub()).toBe(HUB_CLI_PATH);
  });
  it("returns null when the Hub is absent", async () => {
    const r = new MacOsResolver(new FakeProbe());
    expect(await r.findHub()).toBeNull();
  });
});

describe("MacOsResolver.findEditor", () => {
  it("returns the editor binary path when present", async () => {
    const path = editorBinaryPath(VERSION);
    const r = new MacOsResolver(new FakeProbe({ existing: [path] }));
    expect(await r.findEditor(VERSION)).toBe(path);
  });
  it("returns null when that version is not installed", async () => {
    const r = new MacOsResolver(new FakeProbe());
    expect(await r.findEditor(VERSION)).toBeNull();
  });
});

describe("MacOsResolver.verifyEditorPath (unityPath override)", () => {
  it("accepts an explicit path that exists", async () => {
    const custom = "/Volumes/Work/Unity/Unity.app/Contents/MacOS/Unity";
    const r = new MacOsResolver(new FakeProbe({ existing: [custom] }));
    expect(await r.verifyEditorPath(custom)).toBe(true);
  });
  it("rejects an explicit path that does not exist", async () => {
    const r = new MacOsResolver(new FakeProbe());
    expect(await r.verifyEditorPath("/nope/Unity")).toBe(false);
  });
});

describe("MacOsResolver.installEditor", () => {
  it("fails fast with an actionable message when the Hub is missing", async () => {
    const r = new MacOsResolver(new FakeProbe());
    await expect(r.installEditor(VERSION, "arm64")).rejects.toThrow(/Unity Hub not found/);
  });

  it("drives the Hub CLI with the right command and returns the new editor path", async () => {
    const editor = editorBinaryPath(VERSION);
    const probe = new FakeProbe({
      // Hub is present from the start; the editor appears only after install.
      existing: [HUB_CLI_PATH],
      exec: () => {
        probe.existing.add(editor);
        return { stdout: "done", stderr: "", code: 0 };
      },
    });
    const r = new MacOsResolver(probe);

    expect(await r.installEditor(VERSION, "arm64")).toBe(editor);
    const install = probe.calls.find((c) => c.command === HUB_CLI_PATH);
    expect(install?.args).toEqual([
      "--",
      "--headless",
      "install",
      "--version",
      VERSION,
      "--architecture",
      "arm64",
    ]);
  });

  it("throws when the Hub CLI exits non-zero", async () => {
    const r = new MacOsResolver(
      new FakeProbe({
        existing: [HUB_CLI_PATH],
        exec: () => ({ stdout: "", stderr: "no such version", code: 1 }),
      }),
    );
    await expect(r.installEditor(VERSION, "arm64")).rejects.toThrow(/failed/);
  });

  it("throws if the Hub reports success but produces no binary", async () => {
    const r = new MacOsResolver(
      new FakeProbe({
        existing: [HUB_CLI_PATH],
        exec: () => ({ stdout: "done", stderr: "", code: 0 }),
      }),
    );
    await expect(r.installEditor(VERSION, "arm64")).rejects.toThrow(/no editor binary/);
  });
});
