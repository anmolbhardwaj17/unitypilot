/**
 * Orchestrator-wide configuration resolved at startup.
 *
 * Project-root resolution (SPEC §3): one project per session, rooted at
 * `UNITY_MCP_PROJECT_ROOT` if set, else the process working directory.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT_ENV = "UNITY_MCP_PROJECT_ROOT";

/**
 * UPM package name the bridge registers under in a project's Packages/manifest.json.
 * This is the vendored fork's own package id (CoderGamester/mcp-unity, see
 * packages/bridge/FORK.md); injection points a `file:` dependency at packages/bridge.
 */
export const BRIDGE_PACKAGE_NAME = "com.gamelovers.mcp-unity";

/** Default port the vendored bridge's in-editor WebSocket server listens on. */
export const BRIDGE_WS_PORT = 8090;

/** WebSocket service path the bridge registers (ws://host:port/McpUnity). */
export const BRIDGE_WS_PATH = "/McpUnity";

export function resolveProjectRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[PROJECT_ROOT_ENV];
  return fromEnv && fromEnv.length > 0 ? fromEnv : process.cwd();
}

/**
 * Absolute path to the forked C# bridge UPM package, which the orchestrator injects
 * into a project's `Packages/manifest.json` as a `file:` dependency.
 *
 * Two layouts:
 *  - **Published** (`npm install unitypilot`): the bridge is bundled at
 *    `<package>/vendor/bridge` (copied in by the `prepack` step). From `dist/config.js`
 *    that's `../vendor/bridge`.
 *  - **Monorepo dev** (running `dist/` or `src/` in-tree): the bridge lives at
 *    `packages/bridge`, two dirs below this module.
 * Prefer the bundled copy when present, else fall back to the monorepo path.
 */
export function resolveBridgePackagePath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/orchestrator/{dist,src}
  const bundled = join(here, "..", "vendor", "bridge");
  if (existsSync(bundled)) return bundled;
  return join(here, "..", "..", "bridge");
}
