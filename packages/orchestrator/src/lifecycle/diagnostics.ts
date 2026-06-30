/**
 * Shared Unity-failure diagnostics. Both `create_project` and `launch` can hit the
 * G6 "no headless license" wall, so the detection lives in one place.
 */

/** Signatures of the G6 missing-license failure in Unity's log. */
export const LICENSE_FAILURE =
  /No valid Unity Editor license|com\.unity\.editor\.headless|0 entitlement/i;

/** Actionable message for the G6 license wall. */
export const LICENSE_MESSAGE =
  "Unity has no valid license for headless batchmode (G6). Activate one: open Unity Hub → " +
  "sign in → ensure a Personal or Pro license is active, then retry. Headless -batchmode " +
  "requires an activated license even though no GUI opens.";

export function isLicenseFailure(log: string): boolean {
  return LICENSE_FAILURE.test(log);
}

/** Last N chars of a (possibly huge) Unity log, for inclusion in error messages. */
export function logTail(log: string, n = 500): string {
  return log.trim().slice(-n);
}
