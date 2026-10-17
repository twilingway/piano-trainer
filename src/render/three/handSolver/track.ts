import type { Finger } from "../../../fingering/fingering";
import { FINGERS, LONG, THUMB_KEYS, addAngles, at, handJoints, tipOf } from "./mech";
import type { AngleDelta, Angles, Rest, Root, Vec3 } from "./mech";
import { reachDelta } from "./place";
import type { PlanKey, PlannedPose } from "./plan";

// The hand at a moment: the plan's key poses eased into each other, number by number.

/** What a strike's pose needs on the frame: its root, angles and the press and hover layers. */
export interface TrackPose {
  readonly rootVec: Root;
  readonly angles: Angles;
  readonly press: AngleDelta;
  readonly hover: AngleDelta;
  /** The key each pressing finger plays. */
  readonly pitches: Readonly<Partial<Record<Finger, number>>>;
}

/** A hand's planned keys and the poses they point at; `done` once the whole song is planned. */
export interface Track {
  readonly keys: readonly PlanKey[];
  readonly poses: readonly TrackPose[];
  readonly done: boolean;
}

const layer = (m: ReadonlyMap<Finger, AngleDelta[Finger] & object>): AngleDelta =>
  Object.fromEntries([...m]);

export function trackPose(p: PlannedPose): TrackPose {
  const pitches: Partial<Record<Finger, number>> = {};
  for (const [f, pitch] of p.notes)
    if (p.press.has(f) && !p.dropped.includes(pitch) && pitches[f] === undefined)
      pitches[f] = pitch;
  return {
    rootVec: p.rootVec,
    angles: p.angles,
    press: layer(p.press),
    hover: layer(p.hover),
    pitches
  };
}

export interface HandAt {
  readonly root: Root;
  readonly angles: Angles;
}

/** A key's pose: ready = the strike's own tips HOVER mm over their keys, held notes still pressed;
 * strike and depart = every pressing finger down by the key's travel. */
function keyPose(track: Track, key: PlanKey): HandAt {
  const pose = track.poses[key.strike];
  if (!pose) throw new Error(`no pose for strike ${String(key.strike)}`);
  const layer = key.phase === "ready" ? { ...pose.press, ...pose.hover } : pose.press;
  return { root: pose.rootVec, angles: addAngles(pose.angles, layer) };
}

/**
 * The song time up to which the track is known: the whole song once done, else the last planned
 * strike (its departure depends on the strike after it).
 */
export function knownUntil(track: Track): number {
  if (track.done) return Infinity;
  const last = track.keys[track.keys.length - 1];
  return last ? last.t : -Infinity;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, s: number) => a + (b - a) * s;

function mixAngles(a: Angles, b: Angles, s: number): Angles {
  const thumb = Object.fromEntries(THUMB_KEYS.map((k) => [k, mix(a[1][k], b[1][k], s)]));
  const out: Record<number, unknown> = { 1: thumb };
  for (const f of LONG)
    out[f] = {
      mcp: mix(a[f].mcp, b[f].mcp, s),
      pip: mix(a[f].pip, b[f].pip, s),
      dip: mix(a[f].dip, b[f].dip, s),
      abd: mix(a[f].abd, b[f].abd, s)
    };
  return out as unknown as Angles;
}

/** The key finger f holds down in a key's pose, if it does: pressed, not hovering. */
function holds(track: Track, key: PlanKey, f: Finger): number | undefined {
  const pose = track.poses[key.strike];
  if (pose?.press[f] === undefined) return undefined;
  if (key.phase === "ready" && pose.hover[f] !== undefined) return undefined;
  return pose.pitches[f];
}

const tipIn = (rest: Rest, at: HandAt, f: Finger): Vec3 =>
  tipOf(handJoints(rest, at.angles, at.root), f);

/**
 * The hand at song time t, or undefined while the track is empty. Between two keys whose poses
 * hold the same key down with one finger, that tip goes straight between its two places, so a held
 * note stays down while the hand moves.
 */
export function sampleTrack(track: Track, t: number, rest?: Rest): HandAt | undefined {
  const { keys } = track;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return undefined;
  if (t <= first.t) return keyPose(track, first);
  if (t >= last.t) return keyPose(track, last);
  // The last key at or before t.
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(keys, mid).t <= t) lo = mid;
    else hi = mid;
  }
  const a = at(keys, lo);
  const b = at(keys, hi);
  const s = ease((t - a.t) / Math.max(b.t - a.t, 1e-9));
  const pa = keyPose(track, a);
  const pb = keyPose(track, b);
  const root = pa.root.map((v, i) => mix(v, pb.root[i] ?? v, s)) as unknown as Root;
  let angles = mixAngles(pa.angles, pb.angles, s);
  if (!rest || s <= 0 || s >= 1) return { root, angles };
  for (const f of FINGERS) {
    const pitch = holds(track, a, f);
    if (pitch === undefined || holds(track, b, f) !== pitch) continue;
    const ta = tipIn(rest, pa, f);
    const tb = tipIn(rest, pb, f);
    const goal: Vec3 = [mix(ta[0], tb[0], s), mix(ta[1], tb[1], s), mix(ta[2], tb[2], s)];
    angles = addAngles(angles, { [f]: reachDelta(rest, angles, root, f, goal, true) });
  }
  return { root, angles };
}
