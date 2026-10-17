import type { Hand } from "../../../fingering/fingering";
import type { Library } from "./library";
import type { Rest } from "./mech";
import { planSteps, strikesOf } from "./plan";
import type { FingeredNote, HandPlan, PlanKey } from "./plan";
import { trackPose } from "./track";
import type { TrackPose } from "./track";

// Both hands planned from the start of the song, the hand that lags in song time first, handed on
// in parts: a part carries the keys and poses planned since the last one.

export interface PlanChunk {
  readonly hand: Hand;
  readonly keys: readonly PlanKey[];
  readonly poses: readonly TrackPose[];
  readonly done: boolean;
}

export type HandNotes = Readonly<Record<Hand, readonly FingeredNote[]>>;

interface Lane {
  readonly hand: Hand;
  readonly times: readonly number[];
  readonly steps: Generator<number, HandPlan>;
  readonly plan: HandPlan;
  next: number;
  keysSent: number;
  posesSent: number;
  done: boolean;
}

/**
 * Plans the hands, yielding a part of a hand whenever `due()` says so (a time budget) and when a
 * hand is done. A hand without fingered notes yields one empty, done part.
 */
export function* planChunks(
  rest: Rest,
  library: Library,
  notes: HandNotes,
  due: () => boolean
): Generator<PlanChunk> {
  const lanes: Lane[] = (["left", "right"] as const).map((hand) => {
    const strikes = strikesOf(notes[hand], hand);
    const plan: HandPlan = { hand, keys: [], poses: [], report: [] };
    return {
      hand,
      times: strikes.map((s) => s.time),
      steps: planSteps(rest, library, hand, strikes, plan),
      plan,
      next: 0,
      keysSent: 0,
      posesSent: 0,
      done: strikes.length === 0
    };
  });
  const part = (lane: Lane): PlanChunk => {
    const chunk = {
      hand: lane.hand,
      keys: lane.plan.keys.slice(lane.keysSent),
      poses: lane.plan.poses.slice(lane.posesSent).map(trackPose),
      done: lane.done
    };
    lane.keysSent = lane.plan.keys.length;
    lane.posesSent = lane.plan.poses.length;
    return chunk;
  };
  for (const lane of lanes) if (lane.done) yield part(lane);
  for (;;) {
    const open = lanes.filter((l) => !l.done);
    const lane = open.reduce<Lane | undefined>(
      (best, l) => (!best || (l.times[l.next] ?? 0) < (best.times[best.next] ?? 0) ? l : best),
      undefined
    );
    if (!lane) return;
    lane.done = lane.steps.next().done === true || ++lane.next >= lane.times.length;
    if (lane.done) {
      // Let the generator finish, then hand the rest on.
      while (lane.steps.next().done !== true);
      yield part(lane);
    } else if (due()) {
      for (const l of open) if (l.plan.keys.length > l.keysSent) yield part(l);
    }
  }
}
