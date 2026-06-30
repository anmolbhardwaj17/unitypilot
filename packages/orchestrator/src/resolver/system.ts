/**
 * The real {@link SystemProbe} — the only place the resolver touches the host.
 * Kept deliberately tiny so the interesting logic stays in pure, tested functions.
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { ExecResult, SystemProbe } from "./types.js";

export class NodeSystemProbe implements SystemProbe {
  async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Run a command without a shell. Never rejects: failures surface as a non-zero `code`. */
  exec(command: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        resolve({ stdout, stderr: stderr || String(err), code: 127 });
      });
      child.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });
    });
  }
}
