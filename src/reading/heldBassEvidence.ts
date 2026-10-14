import { heldBassEndPerformance, heldBassReadyAt } from "./heldBassClock";
import { twoHandOrigin, twoHandOwner } from "./twoHandEvidence";
import type { ClockSegment } from "../practice/timing";
import type {
  HeldBassEvent,
  HeldBassFailure,
  HeldBassFragment,
  HeldBassOnset
} from "./heldBassTypes";

export interface HeldBassEvaluation {
  readonly first: HeldBassEvent | null;
  readonly second: HeldBassEvent | null;
  readonly attacks: readonly HeldBassEvent[];
  readonly reason: HeldBassFailure | null;
  readonly held: ReadonlyMap<string, HeldBassEvent>;
  readonly releasedAtMs: number | null;
  readonly rawEndAtMs: number | null;
  readonly spreadMs: number | null;
  readonly bassDownAtMs: number | null;
}
/** Raw order defines physical ownership. Corrected time is only a read of the song clock. */
export function evaluateHeldBassEvents(
  fragment: HeldBassFragment,
  events: readonly HeldBassEvent[],
  clock: readonly ClockSegment[],
  onsets: readonly HeldBassOnset[],
  now: number
): HeldBassEvaluation {
  const held = new Map<string, HeldBassEvent>();
  const attacks: HeldBassEvent[] = [];
  let first: HeldBassEvent | null = null;
  let second: HeldBassEvent | null = null;
  let reason: HeldBassFailure | null = null;
  let releasedAtMs: number | null = null;
  let bassDownAtMs: number | null = null;
  let closed = false;
  const sorted = events.toSorted((a, b) => a.atMs - b.atMs || a.sequence - b.sequence);
  const offset = sorted.find((item) => item.kind === "down")?.offsetMs ?? 0;
  const end =
    onsets.length === fragment.steps.length
      ? heldBassEndPerformance(clock, fragment.song.duration)
      : null;
  const rawEndAtMs = end === null ? null : end + offset;
  for (const event of sorted) {
    const owner = twoHandOwner(event);
    if (event.kind === "up") {
      const down = held.get(owner);
      if (!down || event.atMs < down.atMs) continue;
      held.delete(owner);
      const pitchHeld = [...held.values()].some((item) => item.pitch === event.pitch);
      if (
        first &&
        !reason &&
        !pitchHeld &&
        ((!second && event.pitch === first.pitch) ||
          (second &&
            event.pitch === fragment.bassPitch &&
            (rawEndAtMs === null || event.atMs < rawEndAtMs)))
      )
        reason = "early-release";
      if (!held.size && first) {
        releasedAtMs = event.atMs;
        closed = true;
      }
      continue;
    }
    if (held.has(owner)) continue;
    const pitchHeld = [...held.values()].some((item) => item.pitch === event.pitch);
    held.set(owner, event);
    if (closed || reason) continue;
    if (!first) {
      first = event;
      if (event.pitch === fragment.bassPitch) bassDownAtMs = event.atMs;
      if (event.pitch !== fragment.bassPitch && event.pitch !== fragment.melodyPitches[0])
        reason = "wrong-note";
      else if (!heldBassReadyAt(fragment, clock, onsets, 0, event.atMs - offset))
        reason = "early-melody";
      continue;
    }
    if (twoHandOrigin(event) !== twoHandOrigin(first) || (event.offsetMs ?? 0) !== offset) {
      reason = "mixed-origin";
      continue;
    }
    if (pitchHeld) continue;
    if (!second) {
      if (event.pitch === first.pitch) continue;
      if (event.pitch !== fragment.bassPitch && event.pitch !== fragment.melodyPitches[0]) {
        reason = "wrong-note";
        continue;
      }
      if (event.atMs - first.atMs > 200) {
        reason = "too-slow";
        continue;
      }
      if (!heldBassReadyAt(fragment, clock, onsets, 0, event.atMs - offset)) {
        reason = "early-melody";
        continue;
      }
      second = event;
      if (event.pitch === fragment.bassPitch) bassDownAtMs = event.atMs;
      attacks.push(event);
      continue;
    }
    if (event.pitch === fragment.bassPitch || attacks.length >= fragment.melodyPitches.length) {
      reason = "third-note";
      continue;
    }
    const step = attacks.length;
    if (event.pitch !== fragment.melodyPitches[step]) {
      reason = "wrong-note";
      continue;
    }
    if (!heldBassReadyAt(fragment, clock, onsets, step, event.atMs - offset)) {
      reason = "early-melody";
      continue;
    }
    if (
      new Set(
        [...held.values()]
          .filter((item) => item.pitch !== fragment.bassPitch)
          .map((item) => item.pitch)
      ).size > 2
    ) {
      reason = "too-many-melody";
      continue;
    }
    attacks.push(event);
  }
  if (first && !second && !reason && now > first.atMs + 450) reason = "too-slow";
  return {
    first,
    second,
    attacks,
    reason,
    held,
    releasedAtMs,
    rawEndAtMs,
    spreadMs: first && second ? second.atMs - first.atMs : null,
    bassDownAtMs
  };
}
