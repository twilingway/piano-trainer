const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** A deterministic view of song seconds: pause and seek need no additional state. */
export function performanceSceneTimeline(songTime: number) {
  const time = Number.isFinite(songTime) ? Math.max(0, songTime) : 0;
  const orbitTime = Math.max(0, time - 16);
  return {
    rise: smooth((time - 10) / 6),
    vertical: smooth(orbitTime / 6),
    spotFade:
      0.28 * smooth((time - 12) / 0.3) +
      0.22 * smooth((time - 12.3) / 1.7) +
      0.5 * smooth((time - 14) / 1.5),
    orbit: 0.12 * (orbitTime - 3 * (1 - Math.exp(-orbitTime / 3))),
    tilt: smooth(orbitTime / 8)
  };
}
