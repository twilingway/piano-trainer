import { quartersAt } from "../song/song";
import type { Song, SongNote } from "../song/song";

export interface TabEvent {
  readonly id: string;
  readonly hand: "left" | "right";
  readonly start: number;
  readonly end: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly firstColumn: number;
  readonly lastColumn: number;
  readonly notes: readonly SongNote[];
}

export interface TabModel {
  readonly boundaries: readonly number[];
  readonly measures: ReadonlySet<number>;
  readonly events: readonly TabEvent[];
}

/** Onsets, individual releases and measure edges share one grid for both hands. */
export function buildPianoTabs(song: Song): TabModel {
  const boundaries = new Set<number>([0]);
  const measures = new Set(song.measures.map((measure) => measure.start));
  const groups = new Map<string, SongNote[]>();
  for (const note of song.notes) {
    boundaries.add(note.startBeat);
    boundaries.add(quartersAt(song, note.start + note.duration));
    const key = `${note.hand}:${String(note.startBeat)}`;
    const group = groups.get(key);
    if (group) group.push(note);
    else groups.set(key, [note]);
  }
  for (const measure of song.measures) {
    boundaries.add(measure.start);
    boundaries.add(measure.start + measure.length);
  }
  boundaries.add(quartersAt(song, song.duration));
  const ordered = [...boundaries].sort((a, b) => a - b);
  const indices = new Map(ordered.map((beat, index) => [beat, index + 1]));
  const events: TabEvent[] = [];
  for (const [id, notes] of groups) {
    const first = notes[0];
    if (!first) continue;
    const end = Math.max(...notes.map((note) => note.start + note.duration));
    const endBeat = quartersAt(song, end);
    events.push({
      id,
      hand: first.hand,
      start: first.start,
      end,
      startBeat: first.startBeat,
      endBeat,
      firstColumn: indices.get(first.startBeat) ?? 1,
      lastColumn: indices.get(endBeat) ?? ordered.length,
      notes: notes.sort((a, b) => b.pitch - a.pitch)
    });
  }
  return { boundaries: ordered, measures, events };
}

export interface TabLayoutOptions {
  readonly zoom: number;
  readonly singleLine: boolean;
  readonly measuresPerLine: 0 | 2 | 4 | 8;
  readonly viewportWidth: number;
  readonly noteNames: "off" | "ru" | "en";
}

export interface TabLayoutEvent {
  readonly event: TabEvent;
  readonly left: number;
  readonly width: number;
  /** A continuation after a line break does not repeat the note attack. */
  readonly attack: boolean;
}

export interface TabRow {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly boundaries: readonly number[];
  /** Pixel positions corresponding to boundaries, including the final edge. */
  readonly offsets: readonly number[];
  readonly width: number;
  readonly events: readonly TabLayoutEvent[];
}

/** Interpolating the shared grid preserves rhythmic position within long notes and rests. */
function positionOnGrid(
  boundaries: readonly number[],
  offsets: readonly number[],
  beat: number
): number {
  const first = boundaries[0];
  if (first === undefined || beat <= first) return offsets[0] ?? 0;
  for (let index = 1; index < boundaries.length; index++) {
    const end = boundaries[index];
    const start = boundaries[index - 1];
    const left = offsets[index - 1];
    const right = offsets[index];
    if (end === undefined || start === undefined || left === undefined || right === undefined)
      continue;
    if (beat <= end) return left + ((beat - start) / (end - start)) * (right - left);
  }
  return offsets.at(-1) ?? 0;
}

/** Fixed musical widths never expand to fill a wide viewport. Wraps occur only at measure edges. */
export function layoutPianoTabs(model: TabModel, options: TabLayoutOptions): readonly TabRow[] {
  const first = model.boundaries[0];
  const last = model.boundaries.at(-1);
  if (first === undefined || last === undefined || last <= first) return [];
  const zoom = Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
  const minimum = (options.noteNames === "ru" ? 88 : 36) * zoom;
  const offsets = [0];
  for (let index = 1; index < model.boundaries.length; index++) {
    const start = model.boundaries[index - 1] ?? first;
    const end = model.boundaries[index] ?? start;
    offsets.push((offsets.at(-1) ?? 0) + Math.max(minimum, (end - start) * 68 * zoom));
  }
  const edges = [
    first,
    ...[...model.measures].filter((beat) => beat > first && beat < last).sort((a, b) => a - b),
    last
  ];
  const spans: { start: number; end: number }[] = [];
  if (options.singleLine) spans.push({ start: first, end: last });
  else {
    const viewport = Math.max(1, options.viewportWidth);
    let startIndex = 0;
    for (let endIndex = 1; endIndex < edges.length; endIndex++) {
      const start = edges[startIndex] ?? first;
      const end = edges[endIndex] ?? last;
      const next = edges[endIndex + 1];
      const fixedLimit =
        options.measuresPerLine > 0 && endIndex - startIndex >= options.measuresPerLine;
      const autoLimit =
        options.measuresPerLine === 0 &&
        next !== undefined &&
        positionOnGrid(model.boundaries, offsets, next) -
          positionOnGrid(model.boundaries, offsets, start) >
          viewport;
      if (next === undefined || fixedLimit || autoLimit) {
        spans.push({ start, end });
        startIndex = endIndex;
      }
    }
  }
  return spans.map(({ start, end }) => {
    const boundaries = model.boundaries.filter((beat) => beat >= start && beat <= end);
    const origin = positionOnGrid(model.boundaries, offsets, start);
    const rowOffsets = boundaries.map(
      (beat) => positionOnGrid(model.boundaries, offsets, beat) - origin
    );
    const events = model.events
      .filter((event) => event.startBeat < end && event.endBeat > start)
      .map((event) => {
        const left = positionOnGrid(boundaries, rowOffsets, Math.max(start, event.startBeat));
        return {
          event,
          left,
          width: positionOnGrid(boundaries, rowOffsets, Math.min(end, event.endBeat)) - left,
          attack: event.startBeat >= start
        };
      });
    return {
      startBeat: start,
      endBeat: end,
      boundaries,
      offsets: rowOffsets,
      width: rowOffsets.at(-1) ?? 0,
      events
    };
  });
}

/** One song clock selects a row and a continuous pixel position; no timers are needed. */
export function positionInTabs(
  rows: readonly TabRow[],
  beat: number
): { readonly row: number; readonly x: number } | undefined {
  if (rows.length === 0 || Number.isNaN(beat)) return undefined;
  const index = rows.findIndex((row) => beat < row.endBeat);
  const rowIndex = index < 0 ? rows.length - 1 : index;
  const row = rows[rowIndex];
  if (!row) return undefined;
  return { row: rowIndex, x: positionOnGrid(row.boundaries, row.offsets, beat) };
}
