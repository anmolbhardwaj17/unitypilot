/**
 * `ensure_editor` service (SPEC §4a) — resolve or install an editor, then freeze
 * `arch` / `editorPath` / `unityVersion` and transition to `editor_ready`.
 *
 * Pure-ish: all host interaction is via the injected {@link UnityResolver}. The
 * freeze + write is done through the {@link StateStore}.
 */

import type { UnityResolver } from "../resolver/index.js";
import { initialState } from "../state/schema.js";
import { type StateStore, mergeFrozen } from "../state/store.js";

export interface EnsureEditorInput {
  unityVersion: string;
  unityPath?: string;
}

export interface EnsureEditorResult {
  editorPath: string;
  arch: string;
  unityVersion: string;
  /** True if we drove the Hub CLI to install; false if an existing editor was found/overridden. */
  installed: boolean;
}

export async function ensureEditor(
  resolver: UnityResolver,
  store: StateStore,
  input: EnsureEditorInput,
): Promise<EnsureEditorResult> {
  const arch = await resolver.detectArch();

  let editorPath: string;
  let installed = false;

  if (input.unityPath !== undefined) {
    if (!(await resolver.verifyEditorPath(input.unityPath))) {
      throw new Error(`unityPath override does not point at an editor binary: ${input.unityPath}`);
    }
    editorPath = input.unityPath;
  } else {
    const found = await resolver.findEditor(input.unityVersion);
    if (found !== null) {
      editorPath = found;
    } else {
      editorPath = await resolver.installEditor(input.unityVersion, arch);
      installed = true;
    }
  }

  const current = (await store.read()) ?? initialState();
  const next = mergeFrozen(
    current,
    { state: "editor_ready", arch, editorPath, unityVersion: input.unityVersion },
    ["arch", "editorPath", "unityVersion"],
  );
  await store.write(next);

  return { editorPath, arch, unityVersion: input.unityVersion, installed };
}
