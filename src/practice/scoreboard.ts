import { quartersAt } from "../song/song";
import type { Song } from "../song/song";

/** What the player's scoreboard shows at a moment of the song. */
export interface Scoreboard {
  /** The measure under the cursor and how many there are; absent for a song without measures. */
  readonly measure?: { readonly current: number; readonly total: number };
  /** Quarter notes a minute as heard, the speed applied; absent without a beat grid. */
  readonly bpm?: number;
  /** Song time as m:ss, for songs without measures and for reference. */
  readonly clock: string;
}

/**
 * The scoreboard at `time` seconds into `song` played at `speed` (1 = as
 * written). A pickup is measure 0, as scores number it, so the first full
 * measure is 1.
 */
export function scoreboard(song: Song, time: number, speed: number): Scoreboard {
  const clock = formatClock(time);
  const measures = song.measures;
  const first = measures[0];
  let measure: Scoreboard["measure"];
  if (first) {
    const quarters = quartersAt(song, time);
    let index = 0;
    for (let i = 0; i < measures.length; i++) {
      const item = measures[i];
      if (item && item.start <= quarters + 1e-6) index = i;
    }
    const pickup = first.length < (first.beats * 4) / first.beatType - 1e-6;
    const offset = pickup ? 0 : 1;
    measure = { current: index + offset, total: measures.length - 1 + offset };
  }
  const bpm = beatRate(song, time);
  return {
    clock,
    ...(measure ? { measure } : {}),
    ...(bpm === undefined ? {} : { bpm: Math.round(bpm * speed) })
  };
}

/** Quarter notes a minute between the two beats around `time`. */
function beatRate(song: Song, time: number): number | undefined {
  const beats = song.beats;
  for (let i = 1; i < beats.length; i++) {
    const before = beats[i - 1];
    const after = beats[i];
    if (!before || !after) break;
    if (time < after.time || i === beats.length - 1) {
      const seconds = after.time - before.time;
      return seconds > 0 ? ((after.position - before.position) / seconds) * 60 : undefined;
    }
  }
  return undefined;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}
