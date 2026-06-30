/**
 * Windows + Linux resolver stubs (SPEC §8: macOS only for v1).
 *
 * These are deliberately obvious throwers, not real implementations. A
 * contributor adding cross-platform support replaces the bodies; the shape is
 * already correct. Per CLAUDE.md these must NEVER become real implementations in v1.
 */

import type { Arch, UnityResolver } from "./types.js";

class NotImplementedResolver implements UnityResolver {
  constructor(private readonly platform: string) {}

  private fail(): never {
    throw new Error(
      `${this.platform} support is not implemented in v1 (macOS only). See SPEC §8. Contributions welcome: implement a UnityResolver for this platform.`,
    );
  }

  async detectArch(): Promise<Arch> {
    return this.fail();
  }
  async findHub(): Promise<string | null> {
    return this.fail();
  }
  async findEditor(_version: string): Promise<string | null> {
    return this.fail();
  }
  async verifyEditorPath(_path: string): Promise<boolean> {
    return this.fail();
  }
  async installEditor(_version: string, _arch: Arch): Promise<string> {
    return this.fail();
  }
}

export class WindowsResolver extends NotImplementedResolver {
  constructor() {
    super("Windows");
  }
}

export class LinuxResolver extends NotImplementedResolver {
  constructor() {
    super("Linux");
  }
}
