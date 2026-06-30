/**
 * Orchestrator-wide configuration resolved at startup.
 *
 * Project-root resolution (SPEC §3): one project per session, rooted at
 * `UNITY_MCP_PROJECT_ROOT` if set, else the process working directory.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT_ENV = "UNITY_MCP_PROJECT_ROOT";

/** Name the bridge stub registers under in a project's Packages/manifest.json. */
export const BRIDGE_PACKAGE_NAME = "com.unitymcp.bridge";

export function resolveProjectRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[PROJECT_ROOT_ENV];
  return fromEnv && fromEnv.length > 0 ? fromEnv : process.cwd();
}

/**
 * Absolute path to `packages/bridge`, resolved relative to this module. Works both
 * from compiled `dist/config.js` and from `src/config.ts` under Vitest, since both
 * sit two directories below `packages/`.
 */
export function resolveBridgePackagePath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/orchestrator/{dist,src}
  return join(here, "..", "..", "bridge");
}
