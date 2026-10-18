const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** The full opening: hands until 10 s, the rise and stage light until 16 s. */
export const PERFORMANCE_OPENING_SECONDS = 16;
/** Songs shorter than this get the compressed opening and the short camera route. */
export const PERFORMANCE_SHORT_SONG_SECONDS = 60;
const SHORT_OPENING_SECONDS = 6;

/** A song of known length under a minute; the duration is its last note end. */
export function performanceShortSong(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && duration < PERFORMANCE_SHORT_SONG_SECONDS;
}

/** One opening length for camera, lights and stage. */
export function performanceOpeningSeconds(duration: number): number {
  return performanceShortSong(duration) ? SHORT_OPENING_SECONDS : PERFORMANCE_OPENING_SECONDS;
}

/** The full opening's hands-only seconds; the rest of it is the rise. */
const HANDS_SECONDS = 10;
/** A shorter opening gives most of its time to the rise, which cannot speed up as much. */
const SHORT_RISE_SHARE = 0.85;

/** Song seconds of the opening's close hands shot, before the rise begins. */
export function performanceOpeningHandsSeconds(
  openingSeconds = PERFORMANCE_OPENING_SECONDS
): number {
  if (openingSeconds === PERFORMANCE_OPENING_SECONDS) return HANDS_SECONDS;
  return (
    openingSeconds -
    Math.min(PERFORMANCE_OPENING_SECONDS - HANDS_SECONDS, openingSeconds * SHORT_RISE_SHARE)
  );
}

/**
 * Song seconds on the full opening's clock: its phases keep their long-song order and shape, the
 * hands shot shrinks most. The clock runs on past the opening at the rise's rate.
 */
export function performanceOpeningClock(
  time: number,
  openingSeconds = PERFORMANCE_OPENING_SECONDS
): number {
  if (openingSeconds === PERFORMANCE_OPENING_SECONDS) return time;
  const hands = performanceOpeningHandsSeconds(openingSeconds),
    rise = openingSeconds - hands;
  return time <= hands
    ? time * (HANDS_SECONDS / hands)
    : HANDS_SECONDS + (time - hands) * ((PERFORMANCE_OPENING_SECONDS - HANDS_SECONDS) / rise);
}

/** A deterministic view of song seconds: pause and seek need no additional state. */
export function performanceSceneTimeline(
  songTime: number,
  openingSeconds = PERFORMANCE_OPENING_SECONDS
) {
  const time = Number.isFinite(songTime) ? Math.max(0, songTime) : 0;
  const clock = performanceOpeningClock(time, openingSeconds);
  const orbitTime = Math.max(0, time - openingSeconds);
  return {
    rise: smooth((clock - 10) / 6),
    vertical: smooth(orbitTime / 6),
    spotFade:
      0.28 * smooth((clock - 12) / 0.3) +
      0.22 * smooth((clock - 12.3) / 1.7) +
      0.5 * smooth((clock - 14) / 1.5),
    orbit: 0.12 * (orbitTime - 3 * (1 - Math.exp(-orbitTime / 3))),
    tilt: smooth(orbitTime / 8)
  };
}
