import type { Finger, Hand } from "../../../fingering/fingering";
import type { FingerPitch, Library } from "./library";
import { MISS_MM, WRIST_Z, at } from "./mech";
import type { AngleDelta, Rest, Root } from "./mech";
import { place, pressDelta } from "./place";
import type { Hold, PlacedPose } from "./place";

// The hand over time (tools/hand-rig/hand_plan.py): per hand, from its strikes, the keys of its pose.

/** A note of the song with its finger, in song seconds. */
export interface FingeredNote {
  readonly start: number;
  readonly duration: number;
  readonly pitch: number;
  readonly finger?: Finger | undefined;
  readonly velocity?: number | undefined;
}

/** The wrist's speed over the key plane (mm/s) and the yaw's (deg/s): the teacher's 99th percentile. */
export const SPEED: Readonly<Record<Hand, { readonly wrist: number; readonly yaw: number }>> = {
  left: { wrist: 920, yaw: 145 },
  right: { wrist: 503, yaw: 101 }
};
/** S: the hand stands over the strike's keys this long before the onset. */
export const READY = 0.06;
/** S: a struck pose is kept at least this long. */
export const TAP = 0.05;
/** S: the fingers change between two strikes in at least this long, the hand moving or not. */
const SHIFT = 0.1;
/** Mm: the pressing fingers' tips over their keys while the hand is ready. */
export const HOVER = 6;
/** S: a note ending this close after the next onset is not held into it. */
const HELD_EPS = 0.02;
/** Strikes ahead a new hand position may cover. */
const LOOKAHEAD = 6;
/** S: notes of a hand starting this close together are one strike. */
export const STRIKE_WINDOW = 0.03;

export interface StrikeNote {
  readonly pitch: number;
  readonly finger: Finger;
  readonly end: number;
}

export interface Strike {
  readonly id: string;
  readonly time: number;
  readonly thumb: string | null;
  readonly notes: readonly StrikeNote[];
}

/** A hand's strikes: its fingered notes grouped by onset; notes without a finger take no part. */
export function strikesOf(
  notes: readonly FingeredNote[],
  hand: Hand,
  window = STRIKE_WINDOW
): Strike[] {
  const fingered = notes
    .filter((n): n is FingeredNote & { finger: Finger } => n.finger !== undefined)
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const out: Strike[] = [];
  let group: (FingeredNote & { finger: Finger })[] = [];
  const flush = () => {
    const first = group[0];
    if (!first) return;
    out.push({
      id: `${hand[0] ?? ""}${String(out.length)}`,
      time: first.start,
      thumb: null,
      notes: group.map((n) => ({ pitch: n.pitch, finger: n.finger, end: n.start + n.duration }))
    });
    group = [];
  };
  for (const n of fingered) {
    if (group[0] && n.start - group[0].start > window) flush();
    group.push(n);
  }
  flush();
  return out;
}

/** speed follows the observed p99 benchmark; score accelerates transfers to keep onsets. */
export type PlanTiming = "speed" | "score";

export type Phase = "ready" | "strike" | "depart";

export interface PlanKey {
  readonly t: number;
  readonly phase: Phase;
  readonly strike: number;
}

export interface PlannedPose extends PlacedPose {
  /** The ready pose's lift of the strike's own fingers: their tips HOVER mm over their keys. */
  readonly hover: ReadonlyMap<Finger, AngleDelta[Finger] & object>;
}

export interface StrikeReport {
  readonly id: string;
  readonly time: number;
  readonly flags: string[];
  readonly held: number[];
  readonly released: number[];
  lateS: number;
  missMm: number;
}

export interface HandPlan {
  readonly hand: Hand;
  readonly keys: PlanKey[];
  readonly poses: PlannedPose[];
  readonly report: StrikeReport[];
}

const r4 = (v: number) => Number(v.toFixed(4));
const r3 = (v: number) => Number(v.toFixed(3));
const r1 = (v: number) => Number(v.toFixed(1));
const same = (a: Root, b: Root) => a.every((v, i) => v === b[i]);

/** Seconds the move between two roots needs at the speed limit. */
export function moveTime(a: Root, b: Root, hand: Hand): number {
  const lim = SPEED[hand];
  return Math.max(
    Math.hypot(b[3] - a[3], b[4] - a[4]) / lim.wrist,
    Math.abs(b[0] - a[0]) / lim.yaw
  );
}

/** The ready pose's lift of the strike's own fingers; a held note's finger stays on its key. */
function hoverLift(rest: Rest, pose: PlacedPose, own: ReadonlySet<Finger>): PlannedPose["hover"] {
  const out = new Map<Finger, AngleDelta[Finger] & object>();
  for (const f of pose.press.keys())
    if (own.has(f)) out.set(f, pressDelta(rest, pose.angles, pose.rootVec, f, -HOVER));
  return out;
}

const uniquePairs = (pairs: readonly FingerPitch[]) => {
  const seen = new Set<string>();
  return pairs.filter(([f, p]) => {
    const key = `${String(f)}@${String(p)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * The plan of a hand, strike by strike: each step plans one more strike (and the departure from
 * the one before) into `plan`, so a caller can hand finished parts on before the end.
 */
export function* planSteps(
  rest: Rest,
  library: Library,
  hand: Hand,
  strikes: readonly Strike[],
  plan: HandPlan = { hand, keys: [], poses: [], report: [] },
  timing: PlanTiming = "speed"
): Generator<number, HandPlan> {
  const { keys, poses, report } = plan;
  let sounding: StrikeNote[] = [];
  for (let i = 0; i < strikes.length; i++) {
    const s = at(strikes, i);
    const own: FingerPitch[] = s.notes.map((n) => [n.finger, n.pitch]);
    const used = new Set(own.map(([f]) => f));
    const held = sounding.filter((h) => h.end > s.time + HELD_EPS && !used.has(h.finger));
    const down: FingerPitch[] = [...own, ...held.map((h): FingerPitch => [h.finger, h.pitch])];
    const ref = [[own, s.thumb] as const];
    const prev = poses[poses.length - 1];
    let pose: PlacedPose | undefined;
    if (prev) {
      // The hand stays where it is while its fingers reach the strike's keys from there.
      pose = place(rest, library, hand, down, s.thumb, WRIST_Z, prev, ref);
      if (!same(pose.rootVec, prev.rootVec)) pose = undefined;
    }
    if (!pose) {
      // It has to move: to the position that covers this strike and as many of the next ones as fit
      // one hand position, so that a riff inside it is played by the fingers.
      let hold: Hold | undefined = prev;
      let window = uniquePairs(down);
      let refs: (readonly [FingerPitch[], string | null])[] = [...ref];
      for (const nx of strikes.slice(i + 1, i + 1 + LOOKAHEAD)) {
        const pairs: FingerPitch[] = nx.notes.map((n) => [n.finger, n.pitch]);
        const wider = uniquePairs([...window, ...pairs]);
        if (new Set(wider.map(([f]) => f)).size < wider.length) break;
        if (new Set(wider.map(([, p]) => p)).size < wider.length) break;
        const nextRefs = [...refs, [pairs, nx.thumb] as const];
        const cover = place(rest, library, hand, wider, s.thumb, WRIST_Z, hold, nextRefs);
        if (cover.dropped.length > 0 || Math.max(...Object.values(cover.missMm)) > MISS_MM) break;
        hold = cover;
        window = wider;
        refs = nextRefs;
      }
      pose = place(rest, library, hand, down, s.thumb, WRIST_Z, hold, ref);
    }
    const placed = pose;
    const kept = held.filter((h) => !placed.dropped.includes(h.pitch));
    const rep: StrikeReport = {
      id: s.id,
      time: s.time,
      flags: [...placed.flags],
      held: kept.map((h) => h.pitch),
      released: held.filter((h) => placed.dropped.includes(h.pitch)).map((h) => h.pitch),
      lateS: 0,
      missMm: 0
    };
    const planned: PlannedPose = { ...placed, hover: hoverLift(rest, placed, used) };
    if (i === 0)
      keys.push({
        t: timing === "score" ? s.time - READY : r4(s.time - READY),
        phase: "ready",
        strike: 0
      });
    else {
      const p = at(strikes, i - 1);
      const before = at(poses, i - 1);
      const gap = s.time - p.time;
      let ready = s.time - Math.min(READY, gap / 3);
      const need = moveTime(before.rootVec, planned.rootVec, hand);
      const keptPitches = new Set(kept.map((h) => h.pitch));
      const ends = [
        ...p.notes.filter((n) => !keptPitches.has(n.pitch)).map((n) => n.end),
        ...sounding.filter((h) => !keptPitches.has(h.pitch) && h.end > p.time).map((h) => h.end)
      ];
      const release = ends.length > 0 ? Math.max(...ends) : p.time + TAP;
      // The previous strike's key: its onset, or later when it came late.
      const struck = at(keys, keys.length - 1).t;
      // Score timing budgets both contact and preparation inside this inter-onset gap.
      const tap = timing === "score" ? Math.min(TAP, gap / 3) : TAP;
      const shift = timing === "score" ? Math.min(SHIFT, gap / 3) : SHIFT;
      const depart = Math.max(struck + tap, Math.min(release, ready - Math.max(need, shift)));
      if (depart < release - 1e-6) at(report, i - 1).flags.push("cut");
      const arrive = depart + need;
      if (timing === "score") {
        if (arrive > ready + 1e-6) rep.flags.push("accelerated");
      } else if (arrive > ready + 1e-6) {
        rep.flags.push("degraded");
        rep.lateS = r3(Math.max(0, arrive - s.time));
        if (arrive > s.time && need > 0)
          rep.missMm = r1(
            (Math.hypot(
              planned.rootVec[3] - before.rootVec[3],
              planned.rootVec[4] - before.rootVec[4]
            ) *
              (arrive - s.time)) /
              need
          );
        ready = arrive;
      }
      if (depart > at(keys, keys.length - 1).t + 1e-6)
        keys.push({ t: timing === "score" ? depart : r4(depart), phase: "depart", strike: i - 1 });
      keys.push({ t: timing === "score" ? ready : r4(ready), phase: "ready", strike: i });
    }
    keys.push({
      t: timing === "score" ? s.time : r4(Math.max(s.time, at(keys, keys.length - 1).t + 1e-3)),
      phase: "strike",
      strike: i
    });
    poses.push(planned);
    report.push(rep);
    const keptSet = new Set(kept.map((h) => h.pitch));
    sounding = [...sounding.filter((h) => keptSet.has(h.pitch)), ...s.notes];
    yield i;
  }
  return plan;
}

/** The whole plan of a hand. */
export function planHand(
  rest: Rest,
  library: Library,
  hand: Hand,
  strikes: readonly Strike[],
  timing: PlanTiming = "speed"
): HandPlan {
  const steps = planSteps(rest, library, hand, strikes, undefined, timing);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
