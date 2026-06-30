/**
 * macOS implementation of {@link UnityResolver} (SPEC §5).
 *
 * All host interaction goes through the injected {@link SystemProbe}, so this
 * class is fully unit-testable with a fake. Path/command construction lives in
 * the pure helpers in `paths.ts`; this file is just orchestration + existence checks.
 */

import {
  HUB_CLI_PATH,
  HUB_NOT_FOUND_MESSAGE,
  buildHubInstallArgs,
  editorBinaryPath,
  normalizeArch,
} from "./paths.js";
import { NodeSystemProbe } from "./system.js";
import type { Arch, SystemProbe, UnityResolver } from "./types.js";

export class MacOsResolver implements UnityResolver {
  constructor(private readonly probe: SystemProbe = new NodeSystemProbe()) {}

  async detectArch(): Promise<Arch> {
    const { stdout, stderr, code } = await this.probe.exec("uname", ["-m"]);
    if (code !== 0) {
      throw new Error(`\`uname -m\` failed (code ${code}): ${stderr.trim()}`);
    }
    return normalizeArch(stdout);
  }

  async findHub(): Promise<string | null> {
    return (await this.probe.pathExists(HUB_CLI_PATH)) ? HUB_CLI_PATH : null;
  }

  async findEditor(version: string): Promise<string | null> {
    const path = editorBinaryPath(version);
    return (await this.probe.pathExists(path)) ? path : null;
  }

  async verifyEditorPath(path: string): Promise<boolean> {
    return this.probe.pathExists(path);
  }

  async installEditor(version: string, arch: Arch): Promise<string> {
    const hub = await this.findHub();
    if (hub === null) {
      throw new Error(HUB_NOT_FOUND_MESSAGE);
    }

    const args = buildHubInstallArgs(version, arch);
    const { stderr, code } = await this.probe.exec(hub, args);
    if (code !== 0) {
      throw new Error(
        `Unity Hub install of ${version} (${arch}) failed (code ${code}): ${stderr.trim()}`,
      );
    }

    // Per the determinism principle (SPEC §2): confirm the binary the install
    // claims to have produced actually exists before we let it be frozen.
    const path = editorBinaryPath(version);
    if (!(await this.probe.pathExists(path))) {
      throw new Error(`Hub reported success but no editor binary at ${path}.`);
    }
    return path;
  }
}
