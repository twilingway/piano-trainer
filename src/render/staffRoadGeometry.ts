import type { ScorePlacement, StaffClef } from "../song/scorePlacement";

export interface StaffRoadLayout {
  readonly step: number;
  /** Five bass lines followed by five treble lines, in ascending written pitch. */
  readonly lines: readonly number[];
  x(placement: ScorePlacement): number;
  center(clef: StaffClef): number;
}

/** A shared diatonic scale fitted to the entire song, including every ledger position. */
export function createStaffRoadLayout(
  placements: Iterable<ScorePlacement>,
  width: number
): StaffRoadLayout {
  const ranges = { bass: { low: 0, high: 8 }, treble: { low: 0, high: 8 } };
  for (const { clef, position } of placements) {
    const range = ranges[clef];
    range.low = Math.min(range.low, position);
    range.high = Math.max(range.high, position);
  }
  const padding = 2;
  const gap = 4;
  const span = ranges.bass.high - ranges.bass.low + ranges.treble.high - ranges.treble.low;
  const step = Math.max(0, width) / (span + gap + padding * 2);
  const bass = padding - ranges.bass.low;
  const treble = padding + ranges.bass.high - ranges.bass.low + gap - ranges.treble.low;
  const origins = { bass, treble };
  const x = (placement: ScorePlacement) => (origins[placement.clef] + placement.position) * step;
  const lines = (["bass", "treble"] as const).flatMap((clef) =>
    [0, 2, 4, 6, 8].map((position) => x({ clef, position, accidental: "" }))
  );
  return {
    step,
    lines,
    x,
    center: (clef) => (origins[clef] + 4) * step
  };
}

/** Keep notation spacing until the near end, then smoothly land on the actual piano key. */
export function staffRoadX(staffX: number, keyX: number, depth: number): number {
  const amount = Math.max(0, Math.min(1, (depth - 0.78) / 0.22));
  const smooth = amount * amount * (3 - 2 * amount);
  return staffX + (keyX - staffX) * smooth;
}
