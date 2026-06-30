/**
 * Pure Unity `Packages/manifest.json` bridge injection (SPEC §1, §4a).
 *
 * Keeping this pure (string in → string out) makes the load-bearing "the bridge
 * is registered" guarantee trivially testable, and idempotent by construction.
 */

/** Build the manifest dependency value for a local package directory. */
export function bridgeFileRef(bridgePackagePath: string): string {
  return `file:${bridgePackagePath}`;
}

/**
 * Add (or update) the bridge dependency in a manifest.json document. Idempotent:
 * re-injecting the same ref is a no-op. Preserves existing dependencies and key order
 * as much as JSON allows. Throws if the manifest isn't valid JSON.
 */
export function injectBridgeDependency(
  manifestJson: string,
  bridgePackageName: string,
  fileRef: string,
): string {
  let manifest: { dependencies?: Record<string, string> } & Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestJson);
  } catch (err) {
    throw new Error(`Packages/manifest.json is not valid JSON: ${(err as Error).message}`);
  }

  const dependencies = { ...(manifest.dependencies ?? {}), [bridgePackageName]: fileRef };
  return `${JSON.stringify({ ...manifest, dependencies }, null, 2)}\n`;
}

/** Whether the manifest already registers the bridge at the expected ref. */
export function hasBridgeDependency(
  manifestJson: string,
  bridgePackageName: string,
  fileRef: string,
): boolean {
  try {
    const manifest = JSON.parse(manifestJson) as { dependencies?: Record<string, string> };
    return manifest.dependencies?.[bridgePackageName] === fileRef;
  } catch {
    return false;
  }
}
