import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialState } from "../state/schema.js";
import { StateStore, mergeFrozen } from "../state/store.js";
import { ProjectPathMismatchError, createProject, diagnoseFailure } from "./create-project.js";
import type { Filesystem, ProcessRunner, RunResult } from "./deps.js";

const BRIDGE_PATH = "/repo/packages/bridge";
const BRIDGE_NAME = "com.gamelovers.mcp-unity";

/** In-memory filesystem keyed by absolute path. */
class FakeFs implements Filesystem {
  files = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.files.set(k, v);
  }
  async exists(p: string): Promise<boolean> {
    return this.files.has(p);
  }
  async readFile(p: string): Promise<string> {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return v;
  }
  async writeFile(p: string, data: string): Promise<void> {
    this.files.set(p, data);
  }
  async mkdir(): Promise<void> {}
}

/** A runner that simulates Unity creating the manifest, or a configured failure. */
function fakeRunner(
  onRun: (fs: FakeFs) => RunResult,
  fs: FakeFs,
): ProcessRunner & { calls: number; lastArgs: string[] } {
  const runner = {
    calls: 0,
    lastArgs: [] as string[],
    async run(_command: string, args: string[]): Promise<RunResult> {
      runner.calls += 1;
      runner.lastArgs = args;
      return onRun(fs);
    },
  };
  return runner;
}

async function editorReadyStore(root: string): Promise<StateStore> {
  const store = new StateStore(root);
  await store.write(
    mergeFrozen(
      { ...initialState(), state: "editor_ready" },
      { arch: "arm64", editorPath: "/Applications/Unity/.../Unity", unityVersion: "6000.0.72f1" },
      ["arch", "editorPath", "unityVersion"],
    ),
  );
  return store;
}

describe("createProject", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "umcp-cp-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("runs the editor, injects the bridge, freezes projectPath → project_created", async () => {
    const store = await editorReadyStore(root);
    const manifestPath = join(root, "Packages", "manifest.json");
    const fs = new FakeFs();
    const runner = fakeRunner((f) => {
      f.files.set(manifestPath, JSON.stringify({ dependencies: {} }));
      return { stdout: "", stderr: "", code: 0, timedOut: false };
    }, fs);

    const result = await createProject(
      { runner, fs, bridgePackagePath: BRIDGE_PATH, bridgePackageName: BRIDGE_NAME },
      store,
      { projectPath: root },
      root,
    );

    expect(result.scaffolded).toBe(true);
    expect(runner.calls).toBe(1);
    // G1 (scoped): createProject captures Unity's log via `-logFile -`, never a file.
    expect(runner.lastArgs).toContain("-createProject");
    expect(runner.lastArgs.join(" ")).toContain("-logFile -");
    const manifest = JSON.parse(fs.files.get(manifestPath) as string);
    expect(manifest.dependencies[BRIDGE_NAME]).toBe(`file:${BRIDGE_PATH}`);
    const state = await store.read();
    expect(state?.state).toBe("project_created");
    expect(state?.frozen.projectPath).toBe(true);
  });

  it("is resumable: skips the editor run when the project already exists", async () => {
    const store = await editorReadyStore(root);
    const manifestPath = join(root, "Packages", "manifest.json");
    const fs = new FakeFs({ [manifestPath]: JSON.stringify({ dependencies: {} }) });
    const runner = fakeRunner(() => ({ stdout: "", stderr: "", code: 0, timedOut: false }), fs);

    const result = await createProject(
      { runner, fs, bridgePackagePath: BRIDGE_PATH, bridgePackageName: BRIDGE_NAME },
      store,
      { projectPath: root },
      root,
    );

    expect(result.scaffolded).toBe(false);
    expect(runner.calls).toBe(0);
    expect(
      JSON.parse(fs.files.get(manifestPath) as string).dependencies[BRIDGE_NAME],
    ).toBeDefined();
  });

  it("rejects a projectPath that isn't the project root", async () => {
    const store = await editorReadyStore(root);
    const fs = new FakeFs();
    const runner = fakeRunner(() => ({ stdout: "", stderr: "", code: 0, timedOut: false }), fs);
    await expect(
      createProject(
        { runner, fs, bridgePackagePath: BRIDGE_PATH, bridgePackageName: BRIDGE_NAME },
        store,
        { projectPath: "/some/other/dir" },
        root,
      ),
    ).rejects.toBeInstanceOf(ProjectPathMismatchError);
  });

  it("surfaces a Gatekeeper/timeout diagnostic (G3)", async () => {
    const store = await editorReadyStore(root);
    const fs = new FakeFs();
    const runner = fakeRunner(() => ({ stdout: "", stderr: "", code: -1, timedOut: true }), fs);
    await expect(
      createProject(
        { runner, fs, bridgePackagePath: BRIDGE_PATH, bridgePackageName: BRIDGE_NAME },
        store,
        { projectPath: root },
        root,
      ),
    ).rejects.toThrow(/Gatekeeper/);
  });

  it("fails when the editor exits non-zero", async () => {
    const store = await editorReadyStore(root);
    const fs = new FakeFs();
    const runner = fakeRunner(() => ({ stdout: "", stderr: "boom", code: 1, timedOut: false }), fs);
    await expect(
      createProject(
        { runner, fs, bridgePackagePath: BRIDGE_PATH, bridgePackageName: BRIDGE_NAME },
        store,
        { projectPath: root },
        root,
      ),
    ).rejects.toThrow(/failed \(code 1\)/);
  });

  it("detects the G6 missing-license failure and returns an actionable message", async () => {
    const store = await editorReadyStore(root);
    const fs = new FakeFs();
    const runner = fakeRunner(
      () => ({
        stdout: "No valid Unity Editor license found. Please activate your license.",
        stderr: "",
        code: 198,
        timedOut: false,
      }),
      fs,
    );
    await expect(
      createProject(
        { runner, fs, bridgePackagePath: BRIDGE_PATH, bridgePackageName: BRIDGE_NAME },
        store,
        { projectPath: root },
        root,
      ),
    ).rejects.toThrow(/no valid license for headless batchmode/i);
  });
});

describe("diagnoseFailure (G6)", () => {
  it("maps exit code 198 to the license message", () => {
    expect(diagnoseFailure(198, "")).toMatch(/headless batchmode/i);
  });
  it("maps a license log signature to the license message regardless of code", () => {
    expect(
      diagnoseFailure(1, "[Licensing::Module] ... com.unity.editor.headless was not found"),
    ).toMatch(/activate/i);
  });
  it("passes through other failures with the tail of the log", () => {
    expect(diagnoseFailure(2, "some compiler error")).toMatch(
      /failed \(code 2\): some compiler error/,
    );
  });
});
