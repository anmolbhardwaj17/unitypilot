/**
 * Injectable seams for the lifecycle services. Real implementations touch the
 * host (spawn Unity, read/write files); tests pass fakes so the service logic is
 * verified without running Unity or hitting disk.
 */

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  /** True if the process was killed for exceeding its timeout (relevant to G3). */
  timedOut: boolean;
}

export interface ProcessRunner {
  run(command: string, args: string[], opts?: { timeoutMs?: number }): Promise<RunResult>;
}

export interface Filesystem {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}
