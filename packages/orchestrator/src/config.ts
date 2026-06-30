/**
 * Orchestrator-wide configuration resolved at startup.
 *
 * Project-root resolution (SPEC §3): one project per session, rooted at
 * `UNITY_MCP_PROJECT_ROOT` if set, else the process working directory.
 */

export const PROJECT_ROOT_ENV = "UNITY_MCP_PROJECT_ROOT";

export function resolveProjectRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[PROJECT_ROOT_ENV];
  return fromEnv && fromEnv.length > 0 ? fromEnv : process.cwd();
}
