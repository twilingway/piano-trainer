import type { TwoHandEvent, TwoHandFailure, TwoHandPair } from "./twoHandTypes";
export function twoHandOwner(
  event: Pick<TwoHandEvent, "source" | "deviceId" | "channel" | "pitch" | "ownerId">
): string {
  return JSON.stringify([
    event.source,
    event.deviceId ?? "",
    event.channel ?? 0,
    event.pitch,
    event.ownerId ?? ""
  ]);
}
export function twoHandOrigin(event: TwoHandEvent): string {
  return JSON.stringify([
    event.source,
    event.source === "midi" ? (event.deviceId ?? "") : "",
    event.source === "midi" ? (event.channel ?? 0) : 0
  ]);
}
export interface TwoHandEvaluation {
  readonly first: TwoHandEvent | null;
  readonly second: TwoHandEvent | null;
  readonly reason: TwoHandFailure | null;
  readonly held: ReadonlyMap<string, TwoHandEvent>;
  readonly releasedAtMs: number | null;
  readonly spreadMs: number | null;
}
/** Replaying raw order is essential: a delivered-late off can precede the second down. */
export function evaluateTwoHandEvents(
  pair: TwoHandPair,
  events: readonly TwoHandEvent[],
  now: number
): TwoHandEvaluation {
  const held = new Map<string, TwoHandEvent>();
  let first: TwoHandEvent | null = null;
  let second: TwoHandEvent | null = null;
  let reason: TwoHandFailure | null = null;
  let releasedAtMs: number | null = null;
  let closed = false;
  for (const event of events.toSorted((a, b) => a.atMs - b.atMs || a.sequence - b.sequence)) {
    const owner = twoHandOwner(event);
    if (event.kind === "up") {
      if (!held.has(owner)) continue;
      held.delete(owner);
      if (
        first &&
        !second &&
        !reason &&
        ![...held.values()].some((down) => down.pitch === first?.pitch)
      )
        reason = "early-release";
      if (held.size === 0 && first) {
        releasedAtMs = event.atMs;
        closed = true;
      }
      continue;
    }
    if (held.has(owner)) continue;
    held.set(owner, event);
    if (closed) continue;
    if (!first) {
      first = event;
      if (!pair.pitches.includes(event.pitch)) reason = "wrong-note";
      continue;
    }
    if (reason) continue;
    if (twoHandOrigin(event) !== twoHandOrigin(first)) {
      reason = "mixed-origin";
      continue;
    }
    if (!pair.pitches.includes(event.pitch)) {
      reason = second ? "third-note" : "wrong-note";
      continue;
    }
    if (event.pitch === first.pitch || event.pitch === second?.pitch) continue;
    if (second) {
      reason = "third-note";
      continue;
    }
    const spread = event.atMs - first.atMs;
    if (spread > 200) {
      reason = "too-slow";
      continue;
    }
    second = event;
  }
  if (first && !second && !reason && now > first.atMs + 450) reason = "too-slow";
  return {
    first,
    second,
    reason,
    held,
    releasedAtMs,
    spreadMs: first && second ? second.atMs - first.atMs : null
  };
}
export function twoHandElapsed(
  intervals: readonly { readonly from: number; readonly to: number | null }[],
  atMs: number
): number {
  return intervals.reduce(
    (sum, interval) => sum + Math.max(0, Math.min(atMs, interval.to ?? atMs) - interval.from),
    0
  );
}
