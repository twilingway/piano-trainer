import { handByPitch } from "../song/song";
import type { Song, SongMeasure } from "../song/song";
import type { Grade, TakeReview } from "./compare";
import type { PlayedNote, Take } from "./take";

/*
 * A take written out as a score: every key where it fell on the song's beat
 * grid and for as long as it was held, rounded to sixteenths, laid out in the
 * original's measures so the two staves can be read against each other.
 * One voice per hand: a key held into the next onset is shown up to it.
 */

/** Sixteenths per quarter: the grid a take is rounded to, and the score's divisions. */
const DIVISIONS = 4;
const DEFAULT_QUARTERS_PER_SECOND = 2;

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

const SPELLING: readonly (readonly [string, number])[] = [
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

export type TranscribedGrade = Grade | "extra";

export interface Transcription {
  readonly musicXml: string;
  /** Grade of each written note by `${quarters}:${pitch}` of its first head. */
  readonly grades: ReadonlyMap<string, TranscribedGrade>;
}

/** Quarter notes at a song time, read off the song's beat grid; beyond it, at its edge tempo. */
export function quartersAt(song: Song, time: number): number {
  const beats = song.beats;
  const first = beats[0];
  const second = beats[1];
  if (!first || !second) return time * DEFAULT_QUARTERS_PER_SECOND;
  const rate = (a: typeof first, b: typeof first) =>
    b.time > a.time ? (b.position - a.position) / (b.time - a.time) : DEFAULT_QUARTERS_PER_SECOND;
  if (time <= first.time) return first.position + (time - first.time) * rate(first, second);
  for (let index = 1; index < beats.length; index++) {
    const after = beats[index];
    const before = beats[index - 1];
    if (!after || !before) break;
    if (time <= after.time) return before.position + (time - before.time) * rate(before, after);
  }
  const last = beats.at(-1) ?? second;
  const beforeLast = beats.at(-2) ?? first;
  return last.position + (time - last.time) * rate(beforeLast, last);
}

interface Placed {
  readonly pitch: number;
  /** Sixteenths from the start of the song. */
  readonly start: number;
  readonly end: number;
  readonly staff: 1 | 2;
  readonly grade: TranscribedGrade;
}

/** Where each key goes on the grid, and which staff and grade it gets. */
function place(song: Song, take: Take, review: TakeReview): Placed[] {
  const owedBy = new Map<PlayedNote, TakeReview["notes"][number]>();
  for (const item of review.notes) if (item.played) owedBy.set(item.played, item);
  return take.notes.map((played) => {
    const owed = owedBy.get(played);
    let startQ = quartersAt(song, played.start);
    let endQ = quartersAt(song, played.end);
    if (take.mode === "wait") {
      // The song stood still while the key was found: its place is the note it answered,
      // its length the time the finger really held it, at the song's tempo there.
      if (owed) startQ = owed.note.startBeat;
      const perSecond = quartersAt(song, played.start + 1) - quartersAt(song, played.start);
      endQ = startQ + (played.realEnd - played.realStart) * take.speed * perSecond;
    }
    const start = Math.round(startQ * DIVISIONS);
    const end = Math.max(start + 1, Math.round(endQ * DIVISIONS));
    const hand = owed?.note.hand ?? handByPitch(played.pitch);
    return {
      pitch: played.pitch,
      start,
      end,
      staff: hand === "right" ? 1 : 2,
      grade: owed ? owed.grade : "extra"
    };
  });
}

interface Segment {
  /** Sixteenths from the song start. */
  readonly start: number;
  readonly end: number;
  /** Empty for a rest. */
  readonly pitches: readonly number[];
}

/** One voice per staff: chords by onset, each lasting until it is let go or the next one comes. */
function voice(notes: readonly Placed[], total: number): Segment[] {
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

function pitchXml(pitch: number): string {
  const [step, alter] = SPELLING[pitch % 12] ?? ["C", 0];
  const alterXml = alter === 0 ? "" : `<alter>${String(alter)}</alter>`;
  return `<pitch><step>${step}</step>${alterXml}<octave>${String(Math.floor(pitch / 12) - 1)}</octave></pitch>`;
}

/** The measures to write: the original's, continued at its last length for keys played past its end. */
function measuresFor(song: Song, until: number): SongMeasure[] {
  const measures =
    song.measures.length > 0
      ? [...song.measures]
      : [{ start: 0, length: 4, beats: 4, beatType: 4 }];
  for (;;) {
    const last = measures.at(-1);
    if (!last || (last.start + last.length) * DIVISIONS >= until) break;
    const nominal = (last.beats * 4) / last.beatType;
    measures.push({ ...last, start: last.start + last.length, length: nominal });
  }
  return measures;
}

/** Writes one staff's voice into one measure: rests, notes, and ties across its edges. */
function measureNotes(
  segments: readonly Segment[],
  from: number,
  to: number,
  staff: 1 | 2
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
        xml += `<note><rest/><duration>${String(size)}</duration>${tail}</note>`;
        return;
      }
      segment.pitches.forEach((pitch, chordIndex) => {
        const ties = (tiedIn ? '<tie type="stop"/>' : "") + (tiedOut ? '<tie type="start"/>' : "");
        const tied =
          tiedIn || tiedOut
            ? `<notations>${tiedIn ? '<tied type="stop"/>' : ""}${tiedOut ? '<tied type="start"/>' : ""}</notations>`
            : "";
        xml +=
          `<note>${chordIndex > 0 ? "<chord/>" : ""}${pitchXml(pitch)}<duration>${String(size)}</duration>` +
          `${ties}${tail}${tied}</note>`;
      });
    });
  }
  return xml;
}

export function transcribeTake(song: Song, take: Take, review: TakeReview): Transcription {
  const placed = place(song, take, review);
  const lastEnd = placed.reduce((end, note) => Math.max(end, note.end), 0);
  const measures = measuresFor(song, lastEnd);
  const last = measures.at(-1);
  const total = last ? Math.round((last.start + last.length) * DIVISIONS) : lastEnd;
  const right = voice(
    placed.filter((note) => note.staff === 1),
    total
  );
  const left = voice(
    placed.filter((note) => note.staff === 2),
    total
  );

  const grades = new Map<string, TranscribedGrade>();
  for (const note of placed) {
    // Of a chord cut short to one voice, every key keeps its own grade under its own pitch.
    grades.set(`${String(note.start / DIVISIONS)}:${String(note.pitch)}`, note.grade);
  }

  const first = measures[0];
  const measureXml = measures.map((measure, index) => {
    const from = Math.round(measure.start * DIVISIONS);
    const to = Math.round((measure.start + measure.length) * DIVISIONS);
    const nominal = (measure.beats * 4) / measure.beatType;
    const head =
      index === 0
        ? `<attributes><divisions>${String(DIVISIONS)}</divisions><key><fifths>0</fifths></key>` +
          `<time><beats>${String(first?.beats ?? 4)}</beats><beat-type>${String(first?.beatType ?? 4)}</beat-type></time>` +
          `<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>` +
          `<clef number="2"><sign>F</sign><line>4</line></clef></attributes>`
        : "";
    const implicit = index === 0 && measure.length < nominal ? ' implicit="yes"' : "";
    return (
      `<measure number="${String(index + 1)}"${implicit}>${head}` +
      measureNotes(right, from, to, 1) +
      `<backup><duration>${String(to - from)}</duration></backup>` +
      measureNotes(left, from, to, 2) +
      `</measure>`
    );
  });

  const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${song.title} — дубль</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measureXml.join("")}</part></score-partwise>`;
  return { musicXml, grades };
}
