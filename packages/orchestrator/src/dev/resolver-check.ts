#!/usr/bin/env node
/**
 * Dev utility for verifying Phase 1's deliverable on a real Mac:
 * "the resolver locates Hub + an editor + arch correctly."
 *
 * Read-only: it calls detectArch / findHub / findEditor / verifyEditorPath only.
 * It NEVER installs anything. Run after `pnpm build`:
 *
 *   node packages/orchestrator/dist/dev/resolver-check.js [unityVersion] [unityPathOverride]
 *
 * Plain console output is fine here — this is a standalone CLI, not the MCP server.
 */

import { createResolver } from "../resolver/index.js";

async function main(): Promise<void> {
  const version = process.argv[2] ?? "6000.0.30f1";
  const override = process.argv[3];
  const resolver = createResolver();

  console.log(`platform: ${process.platform}`);

  const arch = await resolver.detectArch();
  console.log(`arch:     ${arch}`);

  const hub = await resolver.findHub();
  console.log(`hub:      ${hub ?? "NOT FOUND"}`);

  const editor = await resolver.findEditor(version);
  console.log(`editor(${version}): ${editor ?? "NOT FOUND"}`);

  if (override) {
    const ok = await resolver.verifyEditorPath(override);
    console.log(`override(${override}): ${ok ? "exists" : "missing"}`);
  }

  console.log("\nNote: a NOT FOUND editor is expected if that exact version isn't installed;");
  console.log("what matters is that arch + hub resolve, and an installed version is located.");
}

main().catch((err) => {
  console.error("resolver-check failed:", err);
  process.exit(1);
});
