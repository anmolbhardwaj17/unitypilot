/**
 * Real {@link ProcessRunner} and {@link Filesystem} backed by Node. The only
 * lifecycle code that touches the host.
 */

import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import type { Filesystem, ProcessRunner, RunResult } from "./deps.js";

export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: string[], opts?: { timeoutMs?: number }): Promise<RunResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args);
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer =
        opts?.timeoutMs !== undefined
          ? setTimeout(() => {
              timedOut = true;
              child.kill("SIGKILL");
            }, opts.timeoutMs)
          : undefined;

      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr: stderr || String(err), code: 127, timedOut });
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 0, timedOut });
      });
    });
  }
}

export class NodeFilesystem implements Filesystem {
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
  readFile(path: string): Promise<string> {
    return readFile(path, "utf8");
  }
  async writeFile(path: string, data: string): Promise<void> {
    await writeFile(path, data, "utf8");
  }
  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }
}
