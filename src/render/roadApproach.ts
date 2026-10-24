/** The accepted native travel time, shared by every keyboard style. */
const OVERHEAD_APPROACH_SECONDS = 2.22;
/** Perspective needs its own slower travel profile so overhead tuning cannot shorten it. */
const PERSPECTIVE_APPROACH_SECONDS = 6;

/** Visual preview only; the session's musical time and speed remain the caller's. */
export function roadApproach(perspective: boolean): number {
  return perspective ? PERSPECTIVE_APPROACH_SECONDS : OVERHEAD_APPROACH_SECONDS;
}
