import { quintic } from "./performanceCameraMath";
import { performanceShortSong } from "./performanceSceneTimeline";
/** Session-time fades never alter the song, exposure preferences, or DOM HUD. */
export function performanceOutroTimeline(songTime: number, duration: number) {
  const time = Number.isFinite(songTime) ? Math.max(0, songTime) : 0;
  if (!Number.isFinite(duration) || duration <= 0) return { light: 1, blackout: 0 };
  // A short song ends with the camera flying through the sign, in full light.
  if (performanceShortSong(duration)) return { light: 1, blackout: 0 };
  return {
    light: 1 - quintic((time - duration + 8) / 8),
    blackout: quintic((time - duration + 4) / 4)
  };
}
