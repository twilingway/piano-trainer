import { useMemo } from "react";

import { scoreboard } from "../practice/scoreboard";
import { quartersAt } from "../song/song";
import type { Song } from "../song/song";

/** Where the song is: the scoreboard, the share played and the measure ticks on the bar. */
export function useSongProgress(song: Song, time: number, speed: number) {
  const board = scoreboard(song, time, speed);
  const totalQuarters = Math.max(1e-6, quartersAt(song, song.duration));
  const progress = Math.min(1, quartersAt(song, time) / totalQuarters);
  const ticks = useMemo(
    () => song.measures.map((measure) => measure.start / totalQuarters),
    [song, totalQuarters]
  );
  return { board, totalQuarters, progress, ticks };
}
