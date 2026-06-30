/**
 * Shared runtime context for all tool handlers in a session: the state store, the
 * live launch session (editor process + bridge client), and the `busy` mutex that
 * serializes bridge calls. Created once per server in `server.ts`.
 */

import { Mutex } from "../bridge/mutex.js";
import type { LaunchSession } from "../lifecycle/launch.js";
import type { StateStore } from "../state/store.js";

export interface SessionHolder {
  current: LaunchSession | null;
}

export interface ToolContext {
  store: StateStore;
  session: SessionHolder;
  bridgeMutex: Mutex;
}

export function createToolContext(store: StateStore): ToolContext {
  return { store, session: { current: null }, bridgeMutex: new Mutex() };
}
