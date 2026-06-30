/**
 * Pure macOS path/command helpers (SPEC §5). No I/O — every function here is a
 * deterministic string transform, trivially unit-testable.
 *
 * "Verify at runtime, don't hardcode blindly" (SPEC §5): these builders produce
 * the *candidate* paths; the resolver checks existence via the SystemProbe.
 */

import type { Arch } from "./types.js";

/** Unity Hub application bundle. */
export const HUB_APP_PATH = "/Applications/Unity Hub.app";

/** Unity Hub CLI binary (invoked with `--headless`, and `--` before Hub args). */
export const HUB_CLI_PATH = "/Applications/Unity Hub.app/Contents/MacOS/Unity Hub";

/** Root under which the Hub installs editor builds. */
export const EDITORS_ROOT = "/Applications/Unity/Hub/Editor";

/** Actionable message when the Hub is absent (SPEC §5.2). */
export const HUB_NOT_FOUND_MESSAGE = `Unity Hub not found at ${HUB_APP_PATH}. Install Unity Hub from https://unity.com/download, then retry. (v1 installs editors via the Hub, not the Hub itself.)`;

/** Candidate path to a versioned editor binary. */
export function editorBinaryPath(version: string): string {
  return `${EDITORS_ROOT}/${version}/Unity.app/Contents/MacOS/Unity`;
}

/**
 * Map our {@link Arch} to the token the Unity Hub CLI expects.
 * Intel is `x86_64` to the Hub even though we surface it as `x64` (Gotcha G2).
 */
export function hubArch(arch: Arch): "arm64" | "x86_64" {
  return arch === "arm64" ? "arm64" : "x86_64";
}

/**
 * Normalize `uname -m` output to {@link Arch}. Throws on anything unexpected
 * rather than silently guessing — an arch mismatch is a confusing silent failure.
 */
export function normalizeArch(raw: string): Arch {
  const value = raw.trim();
  if (value === "arm64") return "arm64";
  if (value === "x86_64") return "x64";
  throw new Error(
    `Unsupported architecture from \`uname -m\`: "${value}" (expected arm64 or x86_64).`,
  );
}

/**
 * Build the Hub CLI argument vector (everything after the `Unity Hub` binary)
 * for an editor install. Per SPEC §5: `--` precedes Hub-specific args, `--headless`
 * runs it non-interactively.
 *
 * NOTE: a real install may also require `--changeset` for the exact version. That
 * is exercised for the first time in Phase 3 and verified on a Mac then; the
 * optional `changeset` arg is wired through so Phase 3 can supply it.
 */
export function buildHubInstallArgs(version: string, arch: Arch, changeset?: string): string[] {
  const args = [
    "--",
    "--headless",
    "install",
    "--version",
    version,
    "--architecture",
    hubArch(arch),
  ];
  if (changeset) args.push("--changeset", changeset);
  return args;
}
