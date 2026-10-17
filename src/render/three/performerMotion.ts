import type { SongBeat } from "../../song/song";

export interface PerformerMotion {
  readonly bodyRoll: number;
  readonly headRoll: number;
  readonly headYaw: number;
  readonly leftFootPitch: number;
}

const NEUTRAL: PerformerMotion = { bodyRoll: 0, headRoll: 0, headYaw: 0, leftFootPitch: 0 };
const RAD = Math.PI / 180;
const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Last beat at/before time; the score grid is sorted, as in PracticeSession. */
function previousBeat(time: number, beats: readonly SongBeat[]): number {
  let lower = 0;
  let upper = beats.length;
  while (lower < upper) {
    const middle = (lower + upper) >>> 1;
    if ((beats[middle]?.time ?? Infinity) <= time) lower = middle + 1;
    else upper = middle;
  }
  return lower - 1;
}

/** Shared derivatives make phase continuous in both position and speed across tempo changes. */
function slope(beats: readonly SongBeat[], index: number): number {
  const before = beats[Math.max(0, index - 1)];
  const after = beats[Math.min(beats.length - 1, index + 1)];
  return before && after && after.time > before.time
    ? (index > 0 && index < beats.length - 1 ? 2 : 1) / (after.time - before.time)
    : 0;
}

/** Radians relative to the seated pose. Sampling never advances a clock or mutates the score. */
export function performerMotion(time: number, beats: readonly SongBeat[]): PerformerMotion {
  const first = beats[0];
  const second = beats[1];
  const last = beats.at(-1);
  const penultimate = beats.at(-2);
  if (!Number.isFinite(time) || !first || !second || !last || !penultimate) return NEUTRAL;
  const firstGap = second.time - first.time;
  const lastGap = last.time - penultimate.time;
  if (!(firstGap > 0) || !(lastGap > 0) || !Number.isFinite(firstGap + lastGap)) return NEUTRAL;
  if (time < first.time - firstGap || time > last.time + lastGap) return NEUTRAL;
  const previous = previousBeat(time, beats);
  const index = Math.max(0, Math.min(beats.length - 2, previous));
  const before = beats[index];
  const after = beats[index + 1];
  if (!before || !after) return NEUTRAL;
  const gap = after.time - before.time;
  if (!(gap > 0) || !Number.isFinite(gap)) return NEUTRAL;
  const t = Math.max(0, Math.min(1, (time - before.time) / gap));
  const t2 = t * t;
  const t3 = t2 * t;
  let phase =
    index +
    (t3 - 2 * t2 + t) * gap * slope(beats, index) +
    (-2 * t3 + 3 * t2) +
    (t3 - t2) * gap * slope(beats, index + 1);
  if (time > last.time) phase = beats.length - 1 + (time - last.time) / lastGap;
  const activity =
    smooth((time - first.time) / firstGap) * (1 - smooth((time - last.time) / lastGap));
  const turn = (phase * Math.PI) / 2;
  const upcomingIndex = previous + 1;
  const upcoming = beats[upcomingIndex];
  const prior = beats[upcomingIndex - 1];
  const interval = prior && upcoming ? upcoming.time - prior.time : firstGap;
  const lead = Math.min(0.18, interval * 0.4);
  const tap = upcoming && lead > 0 ? (time - upcoming.time + lead) / lead : -1;
  // The toe returns to the seated contact exactly on the beat; the pedal foot is untouched.
  const lift = tap > 0 && tap < 1 ? Math.sin(Math.PI * tap) ** 2 : 0;
  return {
    bodyRoll: 0.75 * RAD * Math.sin(turn - 0.18) * activity,
    headRoll: 2.5 * RAD * Math.sin(turn) * activity,
    headYaw: 2 * RAD * Math.sin(turn - 0.35) * activity,
    leftFootPitch: (upcoming?.downbeat ? 12 : 8) * RAD * lift
  };
}
