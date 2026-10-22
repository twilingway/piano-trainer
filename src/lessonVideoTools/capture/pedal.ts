import type { CapturedNote, PedalCandidate } from "./model.ts";

export interface PedalInterval {
  readonly down: number;
  readonly up: number;
  readonly clippedAtSourceEnd: boolean;
}

export interface PlaybackNote {
  readonly eventId: string;
  readonly pitch: number;
  readonly onset: number;
  readonly baseEnd: number;
  readonly exportedEnd: number;
  readonly provenance: {
    readonly baseEnd: "keyRelease" | "estimatedOffset";
    readonly sustain:
      (PedalInterval & { readonly source: "transkun"; readonly estimated: true }) | null;
    readonly nextSamePitchOnset: number | null;
  };
}

/** Derived sounding durations never replace physical-release observations. */
export function playbackNotes(
  notes: readonly CapturedNote[],
  candidates: readonly PedalCandidate[] | undefined,
  sourceEnd: number
): { notes: PlaybackNote[]; intervals: PedalInterval[]; warnings: string[] } {
  if (!Number.isFinite(sourceEnd) || sourceEnd < 0)
    throw new Error("Неверное окончание источника для педали.");
  const intervals: PedalInterval[] = [];
  const warnings: string[] = [];
  let down: number | null = null;
  for (const candidate of candidates ?? []) {
    if (candidate.value >= 64) {
      down ??= candidate.time;
    } else if (down !== null) {
      if (candidate.time > down)
        intervals.push({ down, up: candidate.time, clippedAtSourceEnd: false });
      down = null;
    }
  }
  if (down !== null) {
    warnings.push("Незакрытый кандидат педали ограничен окончанием источника.");
    if (sourceEnd > down) intervals.push({ down, up: sourceEnd, clippedAtSourceEnd: true });
  }
  if (candidates === undefined)
    warnings.push("Кандидаты педали отсутствуют; это не подтверждает отсутствие педали.");

  const onsets = new Map<number, number[]>();
  for (const note of notes) {
    const pitchOnsets = onsets.get(note.pitch) ?? [];
    pitchOnsets.push(note.onset);
    onsets.set(note.pitch, pitchOnsets);
  }
  for (const pitchOnsets of onsets.values()) pitchOnsets.sort((a, b) => a - b);

  return {
    intervals,
    warnings,
    notes: notes.map((note) => {
      const baseEnd = note.keyRelease ?? note.estimatedOffset;
      const interval = intervals.find((entry) => baseEnd >= entry.down && baseEnd < entry.up);
      const next = onsets.get(note.pitch)?.find((onset) => onset > note.onset) ?? null;
      return {
        eventId: note.id,
        pitch: note.pitch,
        onset: note.onset,
        baseEnd,
        exportedEnd: interval
          ? Math.max(baseEnd, Math.min(interval.up, next ?? Infinity))
          : baseEnd,
        provenance: {
          baseEnd: note.keyRelease === null ? "estimatedOffset" : "keyRelease",
          sustain: interval ? { ...interval, source: "transkun", estimated: true } : null,
          nextSamePitchOnset: next
        }
      };
    })
  };
}
