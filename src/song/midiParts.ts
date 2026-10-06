import type { Hand } from "../fingering/fingering";

/*
 * A MIDI file names no hands and no voices: each melodic track is given a role
 * by its texture (one voice or chords), how busy it is and where it sits.
 */

export type PartRole = "melody" | "second" | "accompaniment" | "bass";

export interface SongPart {
  /** `p<track index>`. */
  readonly id: string;
  readonly role: PartRole;
  /** Russian source text: "Мелодия", "Аккомпанемент 2"; the interface translates it. */
  readonly title: string;
  readonly hand: Hand;
}

export interface TrackStats {
  /** Distinct note starts. */
  readonly onsets: number;
  /** Starts where two or more notes begin together. */
  readonly chordOnsets: number;
  readonly meanPitch: number;
}

/** The top track this far above the next is the melody whatever its texture. */
const SEPARATED_SEMITONES = 7;
/** A track with fewer starts than this share of the busiest one is not a melody candidate. */
const BUSY_SHARE = 0.25;
/** A lone remaining track with this share of chord starts is accompaniment, not bass. */
const CHORDAL_SHARE = 0.5;
/** Under this share of chord starts a track is single-voiced. */
const SINGLE_VOICE_SHARE = 0.15;
/** A second voice sits no further than this below the melody, on average. */
const SECOND_BELOW_SEMITONES = 5;

const ROLE_ORDER: readonly PartRole[] = ["melody", "second", "accompaniment", "bass"];

const ROLE_TITLE: Readonly<Record<PartRole, string>> = {
  melody: "Мелодия",
  second: "Второй голос",
  accompaniment: "Аккомпанемент",
  bass: "Бас"
};

export const ROLE_HAND: Readonly<Record<PartRole, Hand>> = {
  melody: "right",
  second: "right",
  accompaniment: "left",
  bass: "left"
};

/** One role per track, in the tracks' order. */
export function trackRoles(tracks: readonly TrackStats[]): PartRole[] {
  const roles: PartRole[] = tracks.map(() => "accompaniment");
  const byHeight = tracks
    .map((track, index) => ({
      index,
      height: track.meanPitch,
      onsets: track.onsets,
      chords: track.onsets === 0 ? 0 : track.chordOnsets / track.onsets
    }))
    .sort((a, b) => b.height - a.height);
  const [top, next] = byHeight;
  if (!top) return roles;
  let melody = top;
  if (next && top.height - next.height < SEPARATED_SEMITONES) {
    const busiest = Math.max(...byHeight.map((track) => track.onsets));
    // Sorted by height already: the first of the most single-voiced wins a tie.
    for (const track of byHeight) {
      if (track.onsets >= busiest * BUSY_SHARE && track.chords < melody.chords) melody = track;
    }
  }
  roles[melody.index] = "melody";

  const rest = byHeight.filter((track) => track !== melody);
  const lowest = rest.at(-1);
  if (lowest) {
    const lone = rest.length === 1 && lowest.chords >= CHORDAL_SHARE;
    roles[lowest.index] = lone ? "accompaniment" : "bass";
  }
  for (const track of rest.slice(0, -1)) {
    const single = track.chords < SINGLE_VOICE_SHARE;
    const near = melody.height - track.height <= SECOND_BELOW_SEMITONES;
    roles[track.index] = single && near ? "second" : "accompaniment";
  }
  return roles;
}

/**
 * The song's parts, one per track: by role, then from the highest down, with
 * a repeated role numbered ("Аккомпанемент", "Аккомпанемент 2").
 */
export function songParts(tracks: readonly TrackStats[], roles: readonly PartRole[]): SongPart[] {
  const order = tracks
    .map((track, index) => ({ index, role: roles[index] ?? "accompaniment", track }))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        b.track.meanPitch - a.track.meanPitch
    );
  const seen = new Map<PartRole, number>();
  return order.map(({ index, role }) => {
    const count = (seen.get(role) ?? 0) + 1;
    seen.set(role, count);
    return {
      id: `p${String(index)}`,
      role,
      title: count === 1 ? ROLE_TITLE[role] : `${ROLE_TITLE[role]} ${String(count)}`,
      hand: ROLE_HAND[role]
    };
  });
}
