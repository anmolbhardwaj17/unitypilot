/**
 * prepack step: copy the forked C# bridge UPM package into the orchestrator package so it
 * ships inside the published npm tarball. At runtime `resolveBridgePackagePath()` points the
 * project's manifest at this bundled copy (see config.ts). Idempotent: the dest is wiped first.
 *
 * Source: ../../bridge (monorepo `packages/bridge`). Dest: ./vendor/bridge (git-ignored).
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/orchestrator/scripts
const src = join(here, "..", "..", "bridge");
const dest = join(here, "..", "vendor", "bridge");

if (!existsSync(src)) {
  console.error(`[bundle-bridge] source bridge not found at ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`[bundle-bridge] copied bridge -> ${dest}`);
