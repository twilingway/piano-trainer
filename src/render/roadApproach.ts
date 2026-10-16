/** Original V4's measured approach belongs only to overhead views. */
const OVERHEAD_APPROACH_SECONDS = 2.22;
/** Perspective needs its own slower travel profile so overhead tuning cannot shorten it. */
const PERSPECTIVE_APPROACH_SECONDS = 6;
const OVERHEAD_MIN_PITCH = 80;
const LEGACY_LOOK_AHEAD_FACTOR = 4;

/** Visual preview only; the session's musical time and speed remain the caller's. */
export function roadApproach(lookAhead: number, nativePiano: boolean, cameraPitch: number): number {
  if (!nativePiano) return lookAhead * LEGACY_LOOK_AHEAD_FACTOR;
  return cameraPitch >= OVERHEAD_MIN_PITCH
    ? OVERHEAD_APPROACH_SECONDS
    : PERSPECTIVE_APPROACH_SECONDS;
}
