/**
 * `launch` + `shutdown` services (SPEC §4a, Phase 4).
 *
 * `launch` boots the editor headless and polls the bridge's WebSocket until the
 * handshake succeeds, within a timeout that surfaces a G3/G6 diagnostic and kills
 * the editor on failure. The live editor handle is returned so the caller can hold
 * it for `shutdown`. All host interaction (spawn, WS connect) is injected for tests.
 */

import { resolve as resolvePath } from "node:path";
import type { BridgeClient } from "../bridge/client.js";
import { type StateStore, mergeFrozen } from "../state/store.js";
import { ProjectPathMismatchError } from "./create-project.js";
import { LICENSE_MESSAGE, isLicenseFailure, logTail } from "./diagnostics.js";

export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 240_000;
export const HANDSHAKE_POLL_INTERVAL_MS = 1_000;
export const HANDSHAKE_CONNECT_TIMEOUT_MS = 3_000;

/** A handle to a running editor process. */
export interface EditorHandle {
  isAlive(): boolean;
  kill(): void;
  capturedLog(): string;
}

export interface LaunchDeps {
  startEditor(editorPath: string, projectPath: string, graphics: boolean): EditorHandle;
  /** One attempt to open a persistent bridge connection; resolves to a live client or null. */
  connectBridge(): Promise<BridgeClient | null>;
  wsUrl: string;
  handshakeTimeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  nowIso?: () => string;
}

export interface LaunchSession {
  handle: EditorHandle;
  client: BridgeClient;
  projectPath: string;
  wsUrl: string;
}

export interface LaunchInput {
  projectPath: string;
  graphics?: boolean;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Diagnose why the editor died before the handshake (license vs. other). */
function diagnoseEarlyExit(log: string): string {
  if (isLicenseFailure(log)) return LICENSE_MESSAGE;
  return `editor exited before the bridge handshake. Captured log tail:\n${logTail(log) || "(no output)"}`;
}

export async function launch(
  deps: LaunchDeps,
  store: StateStore,
  input: LaunchInput,
  projectRoot: string,
): Promise<LaunchSession> {
  if (resolvePath(input.projectPath) !== resolvePath(projectRoot)) {
    throw new ProjectPathMismatchError(input.projectPath, projectRoot);
  }
  const current = await store.read();
  if (current?.editorPath === undefined) {
    throw new Error("No frozen editorPath in state; run ensure_editor + create_project first.");
  }

  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const pollInterval = deps.pollIntervalMs ?? HANDSHAKE_POLL_INTERVAL_MS;
  const deadline = now() + (deps.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);

  const handle = deps.startEditor(current.editorPath, projectRoot, input.graphics ?? false);

  try {
    while (now() < deadline) {
      if (!handle.isAlive()) {
        throw new Error(diagnoseEarlyExit(handle.capturedLog()));
      }
      const client = await deps.connectBridge();
      if (client) {
        await store.write(
          mergeFrozen(current, { state: "launched", lastHandshakeAt: nowIso() }, []),
        );
        return { handle, client, projectPath: projectRoot, wsUrl: deps.wsUrl };
      }
      await sleep(pollInterval);
    }
    throw new Error(
      `launch timed out — the editor is running but the bridge WebSocket never came up. Possible macOS Gatekeeper/permissions prompt (G3), or the bridge failed to compile. Captured log tail:\n${logTail(handle.capturedLog()) || "(no output)"}`,
    );
  } catch (err) {
    if (handle.isAlive()) handle.kill();
    throw err;
  }
}

export async function shutdown(
  session: LaunchSession | null,
  store: StateStore,
): Promise<{ killed: boolean }> {
  const killed = session !== null;
  if (session) {
    session.client.close();
    session.handle.kill();
  }

  const current = await store.read();
  if (current) {
    await store.write(mergeFrozen(current, { state: "project_created" }, []));
  }
  return { killed };
}
