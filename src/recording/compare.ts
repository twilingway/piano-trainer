import { ownsNote } from "../practice/playableRange";
import type { Song, SongNote } from "../song/song";
import type { PlayedNote, Take } from "./take";

/** How far a key may land from its note, in real seconds, and still be that note. */
const MATCH_WINDOW_S = 0.35;
/** Within this, in real milliseconds, a note is on time. */
const ON_TIME_MS = 80;
/** Held for less than this share of its length: released early. */
const SHORT_BELOW = 0.55;
/** Held for more than this share: held over into the next note. */
const LONG_ABOVE = 1.5;
/** Notes shorter than this, in real seconds, are too quick to judge a release. */
const JUDGE_DURATION_FROM_S = 0.25;
/** Velocity this far from the player's own average stands out as an accent or a drop. */
const LOUDNESS_SPREAD = 25;

export type Timing = "ok" | "early" | "late";
export type Held = "ok" | "short" | "long";
export type Loudness = "ok" | "loud" | "soft";
export type Grade = "good" | "inaccurate" | "missed";

export interface NoteReview {
  readonly note: SongNote;
  readonly played?: PlayedNote;
  readonly grade: Grade;
  /** Real milliseconds, negative = early. Tempo mode only: wait mode holds the song for the key. */
  readonly offsetMs?: number;
  readonly timing?: Timing;
  /** Held time over written length. Tempo mode only. */
  readonly heldRatio?: number;
  readonly held?: Held;
  readonly loudness?: Loudness;
}

export interface TakeReview {
  /** Every note the player owed, in score order. */
  readonly notes: readonly NoteReview[];
  /** Keys that belong to no note: wrong notes and extra presses. */
  readonly extras: readonly PlayedNote[];
  readonly summary: {
    readonly owed: number;
    readonly good: number;
    readonly inaccurate: number;
    readonly missed: number;
    readonly extras: number;
    /** Mean distance from the beat of the notes hit, real milliseconds. */
    readonly meanAbsOffsetMs: number;
    /** Standard deviation of velocity: how even the touch was. */
    readonly velocitySpread: number;
  };
}

/**
 * Lines a take up against the score. Each owed note takes the unclaimed key
 * of its pitch closest to it in time; what is left over is extra. Rhythm and
 * note length are judged only in tempo mode, where the song did not wait.
 */
export function compareTake(song: Song, take: Take): TakeReview {
  const hands = new Set(take.hands);
  const parts = take.parts && new Set(take.parts);
  const owed = song.notes
    .filter((note) => ownsNote(note, hands, take.playable, parts) && note.start >= take.from - 1e-6)
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const window = MATCH_WINDOW_S * take.speed;
  const claimed = new Set<PlayedNote>();
  const tempo = take.mode === "tempo";

  const matched = owed.map((note) => {
    let best: PlayedNote | undefined;
    for (const played of take.notes) {
      if (played.pitch !== note.pitch || claimed.has(played)) continue;
      const distance = Math.abs(played.start - note.start);
      if (distance > window) continue;
      if (!best || distance < Math.abs(best.start - note.start)) best = played;
    }
    if (best) claimed.add(best);
    return { note, played: best };
  });

  const velocities = matched.flatMap(({ played }) => (played ? [played.velocity] : []));
  const meanVelocity =
    velocities.reduce((sum, value) => sum + value, 0) / Math.max(velocities.length, 1);

  const notes: NoteReview[] = matched.map(({ note, played }) => {
    if (!played) return { note, grade: "missed" };
    const loudness: Loudness =
      played.velocity > meanVelocity + LOUDNESS_SPREAD
        ? "loud"
        : played.velocity < meanVelocity - LOUDNESS_SPREAD
          ? "soft"
          : "ok";
    if (!tempo) {
      return { note, played, loudness, grade: loudness === "ok" ? "good" : "inaccurate" };
    }
    const offsetMs = ((played.start - note.start) / take.speed) * 1000;
    const timing: Timing =
      Math.abs(offsetMs) <= ON_TIME_MS ? "ok" : offsetMs < 0 ? "early" : "late";
    const heldRatio = (played.end - played.start) / note.duration;
    const judged = note.duration / take.speed >= JUDGE_DURATION_FROM_S;
    const held: Held = !judged
      ? "ok"
      : heldRatio < SHORT_BELOW
        ? "short"
        : heldRatio > LONG_ABOVE
          ? "long"
          : "ok";
    const clean = timing === "ok" && held === "ok" && loudness === "ok";
    return {
      note,
      played,
      offsetMs,
      timing,
      heldRatio,
      held,
      loudness,
      grade: clean ? "good" : "inaccurate"
    };
  });

  const extras = take.notes.filter((played) => !claimed.has(played));
  const offsets = notes.flatMap((review) =>
    review.offsetMs === undefined ? [] : [Math.abs(review.offsetMs)]
  );
  const variance =
    velocities.reduce((sum, value) => sum + (value - meanVelocity) ** 2, 0) /
    Math.max(velocities.length, 1);
  const count = (grade: Grade) => notes.filter((review) => review.grade === grade).length;
  return {
    notes,
    extras,
    summary: {
      owed: notes.length,
      good: count("good"),
      inaccurate: count("inaccurate"),
      missed: count("missed"),
      extras: extras.length,
      meanAbsOffsetMs: offsets.reduce((sum, value) => sum + value, 0) / Math.max(offsets.length, 1),
      velocitySpread: Math.sqrt(variance)
    }
  };
}
