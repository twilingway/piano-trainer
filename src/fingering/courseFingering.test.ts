// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { LOCAL_LESSONS } from "../song/localLessons";
import { songFromMusicXml } from "../song/musicxml";
import { withFingering } from "../song/song";
import type { SongNote } from "../song/song";

/*
 * The solver against the fingering printed in the local lessons. The lessons
 * are git-ignored scores, so on a clean checkout there is nothing to compare
 * and the suite is skipped; locally it guards the agreement measured when the
 * course rules were added. COURSE_REPORT=1 prints every disagreement by bar.
 */

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const noteName = (pitch: number) =>
  `${NAMES[pitch % 12] ?? ""}${String(Math.floor(pitch / 12) - 1)}`;

interface LevelResult {
  readonly title: string;
  readonly printed: number;
  readonly matched: number;
  readonly chords: number;
  readonly legalChords: number;
  readonly report: readonly string[];
}

/** Left-hand chords the course fingers by rule: an octave, a root-position triad. */
function isRuledChord(chord: readonly SongNote[]): boolean {
  const [low = 0, middle = 0, high = 0] = [...chord]
    .map((note) => note.pitch)
    .sort((a, b) => a - b);
  if (chord.length === 2) return middle - low === 12;
  const lower = middle - low;
  const upper = high - middle;
  return chord.length === 3 && ((lower === 4 && upper === 3) || (lower === 3 && upper === 4));
}

/** The course's rule: an octave on 5-1, a triad on 5-3-1 or 4-2-1. */
function isCourseChord(chord: readonly SongNote[]): boolean {
  const fingers = [...chord]
    .sort((a, b) => a.pitch - b.pitch)
    .map((note) => String(note.finger))
    .join("");
  return chord.length === 2 ? fingers === "51" : fingers === "531" || fingers === "421";
}

function compareLevel(title: string, musicXml: string): LevelResult {
  const song = songFromMusicXml(musicXml, title);
  const bare = { ...song, notes: song.notes.map(({ scoreFinger, ...note }) => note) };
  const solved = new Map(withFingering(bare).notes.map((note) => [note.id, note]));
  const barOf = (beat: number) =>
    song.measures.filter((measure) => measure.start <= beat + 1e-6).length;

  const printed = song.notes.filter((note) => note.scoreFinger !== undefined);
  const report: string[] = [];
  let matched = 0;
  for (const note of printed) {
    const finger = solved.get(note.id)?.finger;
    if (finger === note.scoreFinger) matched++;
    else
      report.push(
        `m${String(barOf(note.startBeat))} ${note.hand} ${noteName(note.pitch)} ` +
          `printed ${String(note.scoreFinger)} solver ${String(finger)}`
      );
  }

  // Left-hand octaves and triads, which the course fingers by rule rather than in print.
  const byStart = new Map<number, SongNote[]>();
  for (const note of solved.values()) {
    if (note.hand !== "left") continue;
    byStart.set(note.start, [...(byStart.get(note.start) ?? []), note]);
  }
  const chords = [...byStart.values()].filter(isRuledChord);
  const illegal = chords.filter((chord) => !isCourseChord(chord));
  for (const chord of illegal)
    report.push(
      `m${String(barOf(chord[0]?.startBeat ?? 0))} left chord ` +
        chord.map((note) => `${noteName(note.pitch)}:${String(note.finger)}`).join(" ")
    );
  return {
    title,
    printed: printed.length,
    matched,
    chords: chords.length,
    legalChords: chords.length - illegal.length,
    report
  };
}

// A level fingered by this program itself proves nothing about the solver.
const results = LOCAL_LESSONS.flatMap((lesson) =>
  lesson.levels
    .filter((level) => !level.title.includes("piano-trainer"))
    .map((level) => compareLevel(`${lesson.title} / ${level.title}`, level.musicXml))
);

describe.skipIf(results.length === 0)("fingering against the local lessons", () => {
  it("agrees with the printed fingering and the course's chord rules", () => {
    const printed = results.reduce((sum, level) => sum + level.printed, 0);
    const matched = results.reduce((sum, level) => sum + level.matched, 0);
    const chords = results.reduce((sum, level) => sum + level.chords, 0);
    const legal = results.reduce((sum, level) => sum + level.legalChords, 0);
    if (import.meta.env.COURSE_REPORT) {
      for (const level of results) {
        console.log(
          `${level.title}: printed ${String(level.matched)}/${String(level.printed)}, ` +
            `left chords ${String(level.legalChords)}/${String(level.chords)}`
        );
        for (const line of level.report) console.log(`   ${line}`);
      }
      console.log(
        `TOTAL printed ${String(matched)}/${String(printed)}, left chords ${String(legal)}/${String(chords)}`
      );
    }
    // Measured when the course rules went in: 864 of 1166 printed fingers (74%).
    expect(matched / Math.max(printed, 1)).toBeGreaterThanOrEqual(0.7);
    expect(legal).toBe(chords);
  });
});
