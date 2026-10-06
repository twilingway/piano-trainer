import type { SongMeasure } from "./song";

/*
 * Notes on a grid of sixteenths written out as a two-staff piano score: one
 * voice per staff, chords by onset, each lasting until it is let go or the next
 * one comes, long notes split into written lengths and tied across bar lines.
 */

/** Sixteenths per quarter: the grid notes are placed on, and the score's divisions. */
export const DIVISIONS = 4;

/** Lengths a single note can be written in, in sixteenths, longest first. */
const WRITABLE: readonly (readonly [number, string, boolean])[] = [
  [16, "whole", false],
  [12, "half", true],
  [8, "half", false],
  [6, "quarter", true],
  [4, "quarter", false],
  [3, "eighth", true],
  [2, "eighth", false],
  [1, "16th", false]
];

/** Pitch-class spellings with sharps (step, alter), for keys without flats. */
const SHARPS: readonly (readonly [string, number])[] = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0]
];

/** The same with flats, for keys with flats. */
const FLATS: readonly (readonly [string, number])[] = [
  ["C", 0],
  ["D", -1],
  ["D", 0],
  ["E", -1],
  ["E", 0],
  ["F", 0],
  ["G", -1],
  ["G", 0],
  ["A", -1],
  ["A", 0],
  ["B", -1],
  ["B", 0]
];

export interface WrittenNote {
  readonly pitch: number;
  /** Sixteenths from the start of the song. */
  readonly start: number;
  readonly end: number;
  readonly staff: 1 | 2;
}

export interface ScoreLayout {
  readonly title: string;
  /** The measures to write, in quarters; at least one. */
  readonly measures: readonly SongMeasure[];
  /** The key signature: sharps above zero, flats below; it also picks the spelling. */
  readonly fifths: number;
}

export interface WrittenScore {
  readonly musicXml: string;
  /**
   * Position among all `<note>` elements of each note's first head, by
   * `headKey(staff, start, pitch)`: what a song note's `sourceIndex` is.
   */
  readonly heads: ReadonlyMap<string, number>;
}

export const headKey = (staff: 1 | 2, start: number, pitch: number): string =>
  `${String(staff)}:${String(start)}:${String(pitch)}`;

interface Segment {
  /** Sixteenths from the song start. */
  readonly start: number;
  readonly end: number;
  /** Empty for a rest. */
  readonly pitches: readonly number[];
}

/** One voice per staff: chords by onset, each lasting until it is let go or the next one comes. */
function voice(notes: readonly WrittenNote[], total: number): Segment[] {
  const onsets = [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let cursor = 0;
  onsets.forEach((onset, index) => {
    const chord = notes.filter((note) => note.start === onset);
    const next = onsets[index + 1] ?? total;
    const end = Math.min(Math.max(...chord.map((note) => note.end)), next);
    if (onset > cursor) segments.push({ start: cursor, end: onset, pitches: [] });
    const pitches = [...new Set(chord.map((note) => note.pitch))].sort((a, b) => a - b);
    segments.push({ start: onset, end, pitches });
    cursor = end;
  });
  if (cursor < total) segments.push({ start: cursor, end: total, pitches: [] });
  return segments;
}

/** The written lengths a span of sixteenths is split into, tied together. */
function pieces(length: number): (readonly [number, string, boolean])[] {
  const result: (readonly [number, string, boolean])[] = [];
  let left = length;
  while (left > 0) {
    const piece = WRITABLE.find(([size]) => size <= left) ?? [1, "16th", false];
    result.push(piece);
    left -= piece[0];
  }
  return result;
}

function pitchXml(pitch: number, fifths: number): string {
  const [step, alter] = (fifths < 0 ? FLATS : SHARPS)[pitch % 12] ?? ["C", 0];
  const alterXml = alter === 0 ? "" : `<alter>${String(alter)}</alter>`;
  return `<pitch><step>${step}</step>${alterXml}<octave>${String(Math.floor(pitch / 12) - 1)}</octave></pitch>`;
}

/** Writes one staff's voice into one measure: rests, notes, and ties across its edges. */
function measureNotes(
  segments: readonly Segment[],
  from: number,
  to: number,
  staff: 1 | 2,
  fifths: number,
  head: (start: number, pitch: number) => void
): string {
  const voiceNumber = staff === 1 ? 1 : 5;
  let xml = "";
  for (const segment of segments) {
    const start = Math.max(segment.start, from);
    const end = Math.min(segment.end, to);
    if (end <= start) continue;
    const parts = pieces(end - start);
    parts.forEach(([size, type, dotted], index) => {
      const tiedIn = segment.pitches.length > 0 && (start > segment.start || index > 0);
      const tiedOut = segment.pitches.length > 0 && (end < segment.end || index < parts.length - 1);
      const tail =
        `<voice>${String(voiceNumber)}</voice><type>${type}</type>${dotted ? "<dot/>" : ""}` +
        `<staff>${String(staff)}</staff>`;
      if (segment.pitches.length === 0) {
        head(-1, -1);
        xml += `<note><rest/><duration>${String(size)}</duration>${tail}</note>`;
        return;
      }
      segment.pitches.forEach((pitch, chordIndex) => {
        head(tiedIn ? -1 : segment.start, pitch);
        const ties = (tiedIn ? '<tie type="stop"/>' : "") + (tiedOut ? '<tie type="start"/>' : "");
        const tied =
          tiedIn || tiedOut
            ? `<notations>${tiedIn ? '<tied type="stop"/>' : ""}${tiedOut ? '<tied type="start"/>' : ""}</notations>`
            : "";
        xml +=
          `<note>${chordIndex > 0 ? "<chord/>" : ""}${pitchXml(pitch, fifths)}<duration>${String(size)}</duration>` +
          `${ties}${tail}${tied}</note>`;
      });
    });
  }
  return xml;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function writeScore(notes: readonly WrittenNote[], layout: ScoreLayout): WrittenScore {
  const last = layout.measures.at(-1);
  const lastEnd = notes.reduce((end, note) => Math.max(end, note.end), 0);
  const total = last ? Math.round((last.start + last.length) * DIVISIONS) : lastEnd;
  const right = voice(
    notes.filter((note) => note.staff === 1),
    total
  );
  const left = voice(
    notes.filter((note) => note.staff === 2),
    total
  );

  const heads = new Map<string, number>();
  let index = 0;
  const counter =
    (staff: 1 | 2) =>
    (start: number, pitch: number): void => {
      if (start >= 0) heads.set(headKey(staff, start, pitch), index);
      index++;
    };

  let previous: SongMeasure | undefined;
  const measureXml = layout.measures.map((measure, number) => {
    const from = Math.round(measure.start * DIVISIONS);
    const to = Math.round((measure.start + measure.length) * DIVISIONS);
    const nominal = (measure.beats * 4) / measure.beatType;
    const time =
      `<time><beats>${String(measure.beats)}</beats>` +
      `<beat-type>${String(measure.beatType)}</beat-type></time>`;
    const changed =
      previous !== undefined &&
      (previous.beats !== measure.beats || previous.beatType !== measure.beatType);
    previous = measure;
    const head =
      number === 0
        ? `<attributes><divisions>${String(DIVISIONS)}</divisions><key><fifths>${String(layout.fifths)}</fifths></key>` +
          time +
          `<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>` +
          `<clef number="2"><sign>F</sign><line>4</line></clef></attributes>`
        : changed
          ? `<attributes>${time}</attributes>`
          : "";
    const implicit = number === 0 && measure.length < nominal ? ' implicit="yes"' : "";
    return (
      `<measure number="${String(number + 1)}"${implicit}>${head}` +
      measureNotes(right, from, to, 1, layout.fifths, counter(1)) +
      `<backup><duration>${String(to - from)}</duration></backup>` +
      measureNotes(left, from, to, 2, layout.fifths, counter(2)) +
      `</measure>`
    );
  });

  const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${escapeXml(layout.title)}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measureXml.join("")}</part></score-partwise>`;
  return { musicXml, heads };
}

/** The measures to write: the song's, continued at its last length until `until` sixteenths. */
export function measuresUntil(measures: readonly SongMeasure[], until: number): SongMeasure[] {
  const result =
    measures.length > 0 ? [...measures] : [{ start: 0, length: 4, beats: 4, beatType: 4 }];
  for (;;) {
    const last = result.at(-1);
    if (!last || (last.start + last.length) * DIVISIONS >= until) break;
    const nominal = (last.beats * 4) / last.beatType;
    result.push({ ...last, start: last.start + last.length, length: nominal });
  }
  return result;
}
