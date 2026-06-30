/**
 * Persistent WebSocket client to the in-editor bridge (SPEC §4b).
 *
 * The bridge speaks a JSON-RPC-ish protocol: we send `{ method, params, id }` and it
 * replies `{ id, result }` or `{ id, error }` (ids echoed). This client correlates
 * responses by id, with per-request timeouts. Established at `launch`, held in the
 * session, closed at `shutdown`.
 *
 * Uses the `ws` package, not Node's built-in global WebSocket: the built-in (undici)
 * client mis-reads the bridge's (websocket-sharp) frames after the first message —
 * subsequent responses arrive as empty payloads. `ws` handles them correctly.
 */

import WebSocket from "ws";

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface BridgeClient {
  request(method: string, params?: object, timeoutMs?: number): Promise<unknown>;
  isOpen(): boolean;
  close(): void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Raised when the bridge returns an `error` for a request. */
export class BridgeError extends Error {
  constructor(
    readonly method: string,
    readonly detail: unknown,
  ) {
    super(
      `bridge '${method}' failed: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    );
    this.name = "BridgeError";
  }
}

export class NodeBridgeClient implements BridgeClient {
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (data) => this.onMessage(data));
    ws.on("close", () => this.failAll(new Error("bridge connection closed")));
    ws.on("error", () => this.failAll(new Error("bridge connection error")));
  }

  /** Open a connection; resolves to a live client or `null` if it can't connect in time. */
  static connect(url: string, openTimeoutMs: number): Promise<NodeBridgeClient | null> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        resolve(null);
        return;
      }
      const timer = setTimeout(() => {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        resolve(null);
      }, openTimeoutMs);
      ws.once("open", () => {
        clearTimeout(timer);
        resolve(new NodeBridgeClient(ws));
      });
      ws.once("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  request(
    method: string,
    params: object = {},
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    const id = String(++this.seq);
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`bridge request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ method, params, id }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  close(): void {
    this.failAll(new Error("bridge client closed"));
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }

  private onMessage(data: WebSocket.RawData): void {
    let msg: { id?: string; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // ignore non-JSON / non-response frames
    }
    if (msg.id === undefined) return;
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(msg.id);
    if (msg.error !== undefined) {
      entry.reject(new BridgeError("request", msg.error));
    } else {
      entry.resolve(msg.result ?? null);
    }
  }

  private failAll(err: Error): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }
}
