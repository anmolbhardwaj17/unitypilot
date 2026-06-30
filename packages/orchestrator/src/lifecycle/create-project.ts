/**
 * `create_project` service (SPEC §4a) — scaffold a headless Unity project at the
 * project root, inject the bridge into manifest.json, freeze `projectPath`, and
 * transition to `project_created`.
 *
 * Hard rules baked in: `-batchmode -nographics` headless; `projectPath` must equal
 * the resolved root (§3); idempotent/resumable. No bridge is attached here, so per
 * G1's clarified scope we use `-logFile -` to capture Unity's log for diagnostics
 * (the never-`-logFile` rule applies to bridge-attached runs / `launch`).
 */

import { join, resolve as resolvePath } from "node:path";
import { type StateStore, mergeFrozen } from "../state/store.js";
import type { Filesystem, ProcessRunner } from "./deps.js";
import { LICENSE_MESSAGE, isLicenseFailure, logTail } from "./diagnostics.js";
import { bridgeFileRef, injectBridgeDependency } from "./manifest.js";

/** Default ceiling for the headless createProject run; surfaces a G3-style diagnostic. */
export const DEFAULT_CREATE_TIMEOUT_MS = 240_000;

/** Turn a non-zero Unity exit into an actionable message (G6 license detection). */
export function diagnoseFailure(code: number, log: string): string {
  if (code === 198 || isLicenseFailure(log)) return LICENSE_MESSAGE;
  return `Unity -createProject failed (code ${code}): ${logTail(log) || "(no output)"}`;
}

export interface CreateProjectDeps {
  runner: ProcessRunner;
  fs: Filesystem;
  bridgePackagePath: string;
  bridgePackageName: string;
  createTimeoutMs?: number;
}

export interface CreateProjectInput {
  projectPath: string;
  template?: string;
  targetPlatform?: string;
}

export interface CreateProjectResult {
  projectPath: string;
  manifestPath: string;
  bridgePackageName: string;
  /** False when the Unity project already existed and the editor run was skipped (resume). */
  scaffolded: boolean;
}

export class ProjectPathMismatchError extends Error {
  constructor(
    readonly projectPath: string,
    readonly projectRoot: string,
  ) {
    super(
      `projectPath (${projectPath}) must equal the resolved project root (${projectRoot}). ` +
        `Set UNITY_MCP_PROJECT_ROOT=${projectPath} or run the orchestrator from that directory.`,
    );
    this.name = "ProjectPathMismatchError";
  }
}

export async function createProject(
  deps: CreateProjectDeps,
  store: StateStore,
  input: CreateProjectInput,
  projectRoot: string,
): Promise<CreateProjectResult> {
  if (resolvePath(input.projectPath) !== resolvePath(projectRoot)) {
    throw new ProjectPathMismatchError(input.projectPath, projectRoot);
  }

  const current = await store.read();
  if (current?.editorPath === undefined) {
    throw new Error("No frozen editorPath in state; call ensure_editor first.");
  }
  const editorPath = current.editorPath;
  const manifestPath = join(projectRoot, "Packages", "manifest.json");

  // Idempotent/resumable: only run the editor if the project isn't already scaffolded.
  const alreadyScaffolded = await deps.fs.exists(manifestPath);
  if (!alreadyScaffolded) {
    // No bridge is attached during -createProject, so per G1's clarified scope we
    // pass `-logFile -` to capture Unity's log on stdout for real diagnostics.
    const args = [
      "-createProject",
      projectRoot,
      "-batchmode",
      "-nographics",
      "-quit",
      "-logFile",
      "-",
    ];
    const result = await deps.runner.run(editorPath, args, {
      timeoutMs: deps.createTimeoutMs ?? DEFAULT_CREATE_TIMEOUT_MS,
    });
    if (result.timedOut) {
      throw new Error(
        "createProject timed out — the editor launched but never exited. This can be a macOS " +
          "Gatekeeper/permissions prompt (G3); try launching this editor once manually.",
      );
    }
    if (result.code !== 0) {
      throw new Error(diagnoseFailure(result.code, `${result.stdout}\n${result.stderr}`));
    }
    if (!(await deps.fs.exists(manifestPath))) {
      throw new Error(`createProject reported success but no manifest at ${manifestPath}.`);
    }
  }

  // Inject the bridge (idempotent).
  const manifestJson = await deps.fs.readFile(manifestPath);
  const injected = injectBridgeDependency(
    manifestJson,
    deps.bridgePackageName,
    bridgeFileRef(deps.bridgePackagePath),
  );
  await deps.fs.writeFile(manifestPath, injected);

  const next = mergeFrozen(current, { state: "project_created", projectPath: projectRoot }, [
    "projectPath",
  ]);
  await store.write(next);

  return {
    projectPath: projectRoot,
    manifestPath,
    bridgePackageName: deps.bridgePackageName,
    scaffolded: !alreadyScaffolded,
  };
}
