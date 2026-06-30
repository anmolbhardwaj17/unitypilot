#!/usr/bin/env node
/**
 * Dev utility for verifying Phase 3 on a real Mac: drives `ensure_editor` then
 * `create_project` against a real directory using the real resolver + Unity, and
 * prints the resulting state and manifest. Run after `pnpm build`:
 *
 *   node packages/orchestrator/dist/dev/lifecycle-check.js <unityVersion> <projectDir>
 *
 * <projectDir> is created if needed and becomes the project root. Requires an
 * activated Unity license for headless batchmode (see SPEC G6).
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BRIDGE_PACKAGE_NAME, resolveBridgePackagePath } from "../config.js";
import { createProject } from "../lifecycle/create-project.js";
import { ensureEditor } from "../lifecycle/ensure-editor.js";
import { NodeFilesystem, NodeProcessRunner } from "../lifecycle/node-deps.js";
import { createResolver } from "../resolver/index.js";
import { StateStore } from "../state/store.js";

async function main(): Promise<void> {
  const version = process.argv[2] ?? "6000.0.72f1";
  const projectDir = process.argv[3] ? resolve(process.argv[3]) : undefined;
  if (!projectDir) {
    console.error("usage: lifecycle-check <unityVersion> <projectDir>");
    process.exit(2);
  }

  const store = new StateStore(projectDir);
  const resolver = createResolver();

  console.log(`ensure_editor (${version})...`);
  const ee = await ensureEditor(resolver, store, { unityVersion: version });
  console.log(`  → ${(await store.read())?.state} | installed=${ee.installed} | ${ee.editorPath}`);

  console.log(`create_project (${projectDir}) — real headless Unity, may take a minute...`);
  const cp = await createProject(
    {
      runner: new NodeProcessRunner(),
      fs: new NodeFilesystem(),
      bridgePackagePath: resolveBridgePackagePath(),
      bridgePackageName: BRIDGE_PACKAGE_NAME,
    },
    store,
    { projectPath: projectDir },
    projectDir,
  );
  console.log(`  → ${(await store.read())?.state} | scaffolded=${cp.scaffolded}`);

  const manifest = JSON.parse(
    await readFile(join(projectDir, "Packages", "manifest.json"), "utf8"),
  );
  console.log(`  bridge dependency: ${manifest.dependencies?.[BRIDGE_PACKAGE_NAME]}`);
  console.log("PHASE 3 OK: project scaffolded with the bridge registered, no GUI opened.");
}

main().catch((err) => {
  console.error(`lifecycle-check failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
