import type {
  CourseExpectedNote,
  CoursePresentation,
  RawCourseInput,
  SongCourseMode
} from "./model";

export const ASSOCIATION_WINDOW_MS = 500;

export interface CourseAlignment {
  readonly primary: ReadonlyMap<string, RawCourseInput>;
  readonly extra: readonly RawCourseInput[];
  readonly inputs: readonly RawCourseInput[];
}

export function inputOrder(
  a: { readonly performanceMs: number; readonly stableOrdinal: number },
  b: { readonly performanceMs: number; readonly stableOrdinal: number }
): number {
  return a.performanceMs - b.performanceMs || a.stableOrdinal - b.stableOrdinal;
}

export function physicalInputKey(input: Pick<RawCourseInput, "source" | "pitch">): string {
  return JSON.stringify([input.source, input.pitch]);
}

/** A repeated MIDI down while still physically held is not a new attack. */
export function physicalEdges(raw: readonly RawCourseInput[]): RawCourseInput[] {
  const held = new Set<string>();
  const edges: RawCourseInput[] = [];
  const seen = new Set<string>();
  for (const input of [...raw].sort(inputOrder)) {
    if (
      input.synthetic ||
      !Number.isFinite(input.performanceMs) ||
      !Number.isFinite(input.songTime) ||
      !Number.isFinite(input.stableOrdinal) ||
      !Number.isInteger(input.pitch) ||
      input.pitch < 0 ||
      input.pitch > 127 ||
      typeof input.source !== "string" ||
      input.source.length === 0
    )
      continue;
    const identity = JSON.stringify([
      input.source,
      input.pitch,
      input.type,
      input.performanceMs,
      input.stableOrdinal
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const key = physicalInputKey(input);
    if (input.type === "down") {
      if (held.has(key)) continue;
      held.add(key);
      edges.push(input);
    } else if (held.delete(key)) edges.push(input);
  }
  return edges;
}

export function alignCourseInputs(
  expected: readonly CourseExpectedNote[],
  raw: readonly RawCourseInput[],
  mode: SongCourseMode,
  speed: number,
  presentations: readonly CoursePresentation[] = [],
  musicalEndPerformanceMs = Infinity
): CourseAlignment {
  const inputs = physicalEdges(raw);
  const primary = new Map<string, RawCourseInput>();
  const extra: RawCourseInput[] = [];
  const targets = [...presentations].sort(inputOrder);
  let lastIndex = -1;
  for (const input of inputs) {
    if (
      input.type !== "down" ||
      input.admitted === false ||
      input.controlRehold ||
      (input.rawPerformanceMs ?? input.performanceMs) > musicalEndPerformanceMs
    )
      continue;
    if (input.pauseProtocolAttack) {
      extra.push(input);
      continue;
    }
    let chosen = -1;
    let distance = Infinity;
    const physicalMs = input.rawPerformanceMs ?? input.performanceMs;
    const target =
      mode === "wait"
        ? targets.findLast(
            (shown) =>
              shown.performanceMs < physicalMs ||
              (shown.performanceMs === physicalMs && shown.stableOrdinal <= input.stableOrdinal)
          )?.sourceNoteId
        : undefined;
    for (const [index, note] of expected.entries()) {
      if (index <= lastIndex) continue;
      if (note.pitch !== input.pitch || primary.has(note.sourceNoteId)) continue;
      if (mode === "wait") {
        if (note.sourceNoteId === target) {
          chosen = index;
          break;
        }
      } else {
        const delta = Math.abs(((input.songTime - note.start) * 1000) / speed);
        if (delta <= ASSOCIATION_WINDOW_MS + 1e-7 && delta < distance - 1e-7) {
          chosen = index;
          distance = delta;
        }
      }
    }
    const selected = expected[chosen];
    if (!selected) extra.push(input);
    else {
      primary.set(selected.sourceNoteId, input);
      lastIndex = chosen;
    }
  }
  return { primary, extra, inputs };
}
