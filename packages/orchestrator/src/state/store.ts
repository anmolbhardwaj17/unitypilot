/**
 * Read/write of `<projectRoot>/.unity-mcp/state.json` with freeze semantics
 * (SPEC §2 determinism principle, §3 state shape).
 *
 * `mergeFrozen` is pure and is where the "frozen value never changes" rule is
 * enforced; the {@link StateStore} is the thin I/O wrapper around it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FROZEN_KEYS, type FrozenKey, type ProjectState, projectStateSchema } from "./schema.js";

/** Thrown when a write would change a value that has already been frozen (SPEC §2/G4). */
export class FrozenViolationError extends Error {
  constructor(
    readonly key: FrozenKey,
    readonly frozenValue: unknown,
    readonly attempted: unknown,
  ) {
    super(
      `Refusing to re-resolve frozen '${key}': it is locked to ${JSON.stringify(frozenValue)} ` +
        `but a write tried to set ${JSON.stringify(attempted)}. Frozen values are read, never recomputed.`,
    );
    this.name = "FrozenViolationError";
  }
}

export type StateUpdates = Partial<Omit<ProjectState, "schemaVersion" | "frozen">>;

/**
 * Pure freeze-aware merge. For every {@link FrozenKey} already frozen in `current`,
 * an update to a *different* value throws {@link FrozenViolationError}. Re-writing
 * the same value is idempotent. Keys in `freezeKeys` are marked frozen in the result.
 */
export function mergeFrozen(
  current: ProjectState,
  updates: StateUpdates,
  freezeKeys: readonly FrozenKey[] = [],
): ProjectState {
  for (const key of FROZEN_KEYS) {
    const incoming = updates[key];
    if (incoming === undefined) continue;
    if (current.frozen[key] && current[key] !== undefined && current[key] !== incoming) {
      throw new FrozenViolationError(key, current[key], incoming);
    }
  }

  const frozen = { ...current.frozen };
  for (const key of freezeKeys) frozen[key] = true;

  return { ...current, ...updates, frozen };
}

export class StateStore {
  readonly filePath: string;

  constructor(readonly projectRoot: string) {
    this.filePath = join(projectRoot, ".unity-mcp", "state.json");
  }

  /** Current state, or `null` when no project has been initialized here yet (→ `none`). */
  async read(): Promise<ProjectState | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return projectStateSchema.parse(JSON.parse(raw));
  }

  async write(state: ProjectState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}
