/**
 * Real implementations of the {@link LaunchDeps} seams: spawn the editor and probe
 * the bridge WebSocket. Uses Node 22's built-in global `WebSocket` — no new dep.
 */

import { spawn } from "node:child_process";
import { BRIDGE_WS_PATH, BRIDGE_WS_PORT } from "../config.js";
import type { EditorHandle } from "./launch.js";

const MAX_LOG = 200_000;

/**
 * Boot the editor non-quitting. `-logFile -` streams Unity's log to stdout for
 * diagnostics — safe because the bridge talks over a WebSocket, not stdout (G1, re-scoped).
 */
export function startEditorProcess(
  editorPath: string,
  projectPath: string,
  graphics: boolean,
): EditorHandle {
  const args = ["-projectPath", projectPath, "-batchmode"];
  if (!graphics) args.push("-nographics");
  args.push("-logFile", "-");

  // UNITY_MCP_HEADLESS opts the (forked) bridge into running its WS server in batch
  // mode — upstream disables it there for CI safety. See packages/bridge/FORK.md.
  const child = spawn(editorPath, args, {
    env: { ...process.env, UNITY_MCP_HEADLESS: "1" },
  });
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
    },
    capturedLog: () => log,
  };
}

/** One WS upgrade attempt to the bridge; resolves true on `open`, false otherwise. */
export function tryConnectWs(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean, ws?: WebSocket) => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch {
        // ignore
      }
      resolve(v);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => done(false, ws), timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      done(true, ws);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      done(false, ws);
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      done(false);
    });
  });
}

/**
 * Candidate URLs to probe. The bridge binds to "localhost", which resolves to
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

/** True if any candidate URL accepts a WS upgrade within the timeout. */
export async function tryConnectAny(urls: string[], timeoutMs: number): Promise<boolean> {
  for (const url of urls) {
    if (await tryConnectWs(url, timeoutMs)) return true;
  }
  return false;
}

export function bridgeWsUrl(): string {
  return `ws://localhost:${BRIDGE_WS_PORT}${BRIDGE_WS_PATH}`;
}
