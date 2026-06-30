/**
 * Resolver types and interfaces (SPEC §5).
 *
 * The resolver is the load-bearing, platform-specific module. ALL platform logic
 * lives behind {@link UnityResolver}; the only `process.platform` switch in the
 * codebase is the factory in `resolver/index.ts`.
 */

/** Detected CPU architecture. macOS ships separate Unity editor builds per arch (Gotcha G2). */
export type Arch = "arm64" | "x64";

/** Result of running an external command. Never throws — a failed command reports a non-zero `code`. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * The narrow seam onto the host system. Injecting this is what makes the resolver
 * "pure and heavily unit-tested" (SPEC Phase 1): tests pass a fake probe, so no
 * test ever touches the real filesystem, `uname`, or the Unity Hub CLI.
 */
export interface SystemProbe {
  pathExists(path: string): Promise<boolean>;
  exec(command: string, args: string[]): Promise<ExecResult>;
}

export interface UnityResolver {
  /** `uname -m` → arch. The only real conditional in the module (SPEC §5.1). */
  detectArch(): Promise<Arch>;
  /** Locate the Unity Hub CLI binary, or `null` if the Hub is not installed. */
  findHub(): Promise<string | null>;
  /** Locate an installed editor of `version`, or `null` if absent. */
  findEditor(version: string): Promise<string | null>;
  /** Honor an explicit `unityPath` override: does this path point at a real editor binary? */
  verifyEditorPath(path: string): Promise<boolean>;
  /** Drive the Hub CLI to install the arch-matched build; resolve to the editor binary path. */
  installEditor(version: string, arch: Arch): Promise<string>;
}
