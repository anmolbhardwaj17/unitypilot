/**
 * Real implementations of the {@link LaunchDeps} seams: spawn the editor and probe
 * the bridge WebSocket. Uses Node 22's built-in global `WebSocket` — no new dep.
 */

import { execFile, spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { type BridgeClient, NodeBridgeClient } from "../bridge/client.js";
import { BRIDGE_WS_PATH, BRIDGE_WS_PORT } from "../config.js";
import { type EditorHandle, HANDSHAKE_CONNECT_TIMEOUT_MS } from "./launch.js";

const MAX_LOG = 200_000;
const KILL_GRACE_MS = 3_000;

/**
 * Clear a stale editor for this project before launching (BACKLOG P1). A
 * `Temp/UnityLockfile` means a prior editor didn't exit cleanly — Unity will refuse to
 * open the project. Kill any lingering editor process for this exact project path, then
 * remove the lockfile.
 */
/**
 * Bring the Unity editor to the foreground (BACKLOG P1). Unity throttles a backgrounded
 * editor's update loop, which stalls asset import/compile during `script_write`. Activating
 * it for the compile window keeps it processing at full rate. Best-effort: `activate` needs
 * no accessibility permission, and failures are ignored.
 */
export function focusEditor(): Promise<void> {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", 'tell application "Unity" to activate'], () => resolve());
  });
}

export async function clearStaleEditor(projectPath: string): Promise<void> {
  const lockfile = join(projectPath, "Temp", "UnityLockfile");
  try {
    await access(lockfile);
  } catch {
    return; // no lockfile → nothing stale
  }
  // pkill -f matches the full command line; the editor's includes `-projectPath <path>`.
  await new Promise<void>((resolve) => {
    execFile("pkill", ["-f", projectPath], () => resolve());
  });
  await new Promise((r) => setTimeout(r, 1_000));
  await rm(lockfile, { force: true }).catch(() => {});
}

/**
 * Boot the editor non-quitting. `-logFile -` streams Unity's log to stdout for
 * diagnostics — safe because the bridge talks over a WebSocket, not stdout (G1, re-scoped).
 */
export function startEditorProcess(
  editorPath: string,
  projectPath: string,
  headless: boolean,
): EditorHandle {
  // Interactive (default): boot the real visible editor — the bridge runs in its native
  // mode (editor loop alive), no -batchmode pump needed, and the user watches changes live.
  // Headless (opt-in, CI): -batchmode -nographics + the forked RunHeadless pump (the editor
  // loop is idle in batch mode) + UNITY_MCP_HEADLESS=1 to opt the bridge in. See FORK.md.
  const args = ["-projectPath", projectPath];
  if (headless) args.push("-batchmode", "-nographics");
  args.push("-logFile", "-");
  if (headless) args.push("-executeMethod", "McpUnity.Unity.McpUnityServer.RunHeadless");

  const env = headless ? { ...process.env, UNITY_MCP_HEADLESS: "1" } : process.env;
  const child = spawn(editorPath, args, { env });
  let log = "";
  let alive = true;
  const append = (chunk: Buffer) => {
    log += chunk.toString();
    if (log.length > MAX_LOG) log = log.slice(-MAX_LOG);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("exit", () => {
    alive = false;
  });
  child.on("error", (err) => {
    alive = false;
    log += `\n[spawn error] ${err}`;
  });

  return {
    isAlive: () => alive,
    kill: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
      // Force-kill if it ignores SIGTERM, so the editor never lingers (BACKLOG P1).
      const timer = setTimeout(() => {
        if (alive) {
          try {
            child.kill("SIGKILL");
          } catch {
            // already gone
          }
        }
      }, KILL_GRACE_MS);
      timer.unref?.();
    },
    capturedLog: () => log,
  };
}

/**
 * Candidate URLs to try. The bridge binds to "localhost", which resolves to
 * 127.0.0.1 or ::1 depending on the system — websocket-sharp listens on only one,
 * so we try both plus the hostname rather than guessing the address family.
 */
export function bridgeWsCandidates(): string[] {
  return [
    `ws://127.0.0.1:${BRIDGE_WS_PORT}${BRIDGE_WS_PATH}`,
    `ws://[::1]:${BRIDGE_WS_PORT}${BRIDGE_WS_PATH}`,
    `ws://localhost:${BRIDGE_WS_PORT}${BRIDGE_WS_PATH}`,
  ];
}

/** One round of connection attempts across the candidate hosts; live client or null. */
export async function connectBridge(): Promise<BridgeClient | null> {
  for (const url of bridgeWsCandidates()) {
    const client = await NodeBridgeClient.connect(url, HANDSHAKE_CONNECT_TIMEOUT_MS);
    if (client) return client;
  }
  return null;
}

export function bridgeWsUrl(): string {
  return `ws://localhost:${BRIDGE_WS_PORT}${BRIDGE_WS_PATH}`;
}
