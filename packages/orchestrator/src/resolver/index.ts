/**
 * Resolver factory — the SINGLE platform-selection site in the codebase
 * (SPEC §5: "No `process.platform` checks sprinkled through the codebase").
 * Everything downstream depends only on the {@link UnityResolver} interface.
 */

import { MacOsResolver } from "./macos.js";
import { LinuxResolver, WindowsResolver } from "./stubs.js";
import type { SystemProbe, UnityResolver } from "./types.js";

export type { Arch, ExecResult, SystemProbe, UnityResolver } from "./types.js";
export { MacOsResolver } from "./macos.js";

/**
 * Build the resolver for the current platform. On macOS an optional {@link SystemProbe}
 * can be injected (used by tests); the stubs take no probe since they only throw.
 */
export function createResolver(probe?: SystemProbe): UnityResolver {
  switch (process.platform) {
    case "darwin":
      return new MacOsResolver(probe);
    case "win32":
      return new WindowsResolver();
    case "linux":
      return new LinuxResolver();
    default:
      throw new Error(`Unsupported platform: ${process.platform} (v1 is macOS only; see SPEC §8).`);
  }
}
