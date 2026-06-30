/**
 * The frozen project state file schema (SPEC §3 / §2).
 *
 * `frozen` records which resolved values are locked. The determinism principle
 * (SPEC §2): a frozen value is read, never re-derived, and may not be overwritten
 * with a different value.
 */

import { z } from "zod";
import { LIFECYCLE_STATES } from "../fsm/machine.js";

export const SCHEMA_VERSION = 1;

/** Resolved values that get frozen once and never recomputed. */
export const FROZEN_KEYS = [
  "arch",
  "unityVersion",
  "editorPath",
  "projectPath",
  "bridgeVersion",
] as const;
export type FrozenKey = (typeof FROZEN_KEYS)[number];

export const projectStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  state: z.enum(LIFECYCLE_STATES),
  arch: z.enum(["arm64", "x64"]).optional(),
  unityVersion: z.string().optional(),
  editorPath: z.string().optional(),
  projectPath: z.string().optional(),
  bridgeVersion: z.string().optional(),
  lastHandshakeAt: z.string().optional(),
  frozen: z.record(z.enum(FROZEN_KEYS), z.boolean()).default({}),
});

export type ProjectState = z.infer<typeof projectStateSchema>;

/** A brand-new project's state: nothing resolved, nothing frozen. */
export function initialState(): ProjectState {
  return { schemaVersion: SCHEMA_VERSION, state: "none", frozen: {} };
}
