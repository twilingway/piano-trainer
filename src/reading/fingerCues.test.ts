// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { generateReadingExercise } from "./generator";
import { generateBassReadingExercise } from "./bassGenerator";
import { generateTwoHandExercise, twoHandPromptXml } from "./twoHandGenerator";
import { generateHeldBassExercise } from "./heldBassGenerator";
import {
  HIDDEN_LESSON_CUE,
  lessonFingerCues,
  musicXmlWithLessonFingerCues,
  withLessonFingering
} from "./fingerCues";
import { lessonFingerLabel } from "./fingerCueLabel";
import { readingPromptXml } from "./prompt";
import { songFromMusicXml } from "../song/musicxml";

describe("prepared lesson finger recommendations", () => {
  it("uses the accepted five-note position for each hand without modifying source material", () => {
    const fragment = generateHeldBassExercise(7).fragments[0];
    if (!fragment) throw new Error("Missing held bass fragment");
    for (const exercise of [
      generateReadingExercise("notes", 7),
      generateBassReadingExercise("notes", 7),
      generateTwoHandExercise(7),
      fragment
    ]) {
      const original = songFromMusicXml(exercise.musicXml, "");
      const stripped = exercise.song.notes.map(
        ({ finger: _finger, transition: _transition, ...note }) => note
      );
      expect(stripped).toEqual(original.notes);
      expect(exercise.musicXml).not.toContain("lesson-finger-cue");
      for (const note of exercise.song.notes) {
        const index = [0, 2, 4, 5, 7].indexOf(note.pitch - (note.hand === "left" ? 48 : 60));
        expect(note.finger).toBe(note.hand === "left" ? 5 - index : index + 1);
      }
    }
  });

  it("retains two recommendations for the same key, with separate note identities", () => {
    const note: SongNote = {
      id: "right",
      hand: "right",
      pitch: 60,
      finger: 1,
      start: 0,
      startBeat: 0,
      duration: 1
    };
    const cues = lessonFingerCues([note, { ...note, id: "left", hand: "left", finger: 5 }]);
    expect(cues).toEqual([
      { noteId: "right", pitch: 60, hand: "right", recommendedFinger: 1 },
      { noteId: "left", pitch: 60, hand: "left", recommendedFinger: 5 }
    ]);
    expect(lessonFingerCues([note])[0]).toBe(cues[0]);
    expect(cues.map((cue) => lessonFingerLabel(cue, "ru"))).toEqual(["П1", "Л5"]);
    expect(cues.map((cue) => lessonFingerLabel(cue, "en"))).toEqual(["R1", "L5"]);
  });

  it("never fabricates a finger for an unprepared note", () => {
    expect(
      lessonFingerCues([{ id: "n", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }])
    ).toEqual([]);
  });
});

describe("allowed display-only MusicXML cue pass", () => {
  it("labels exactly the authorized reading note before selecting its prompt", () => {
    const exercise = generateReadingExercise("notes", 22);
    const note = exercise.song.notes[8];
    if (!note) throw new Error("Missing reading note");
    const cues = lessonFingerCues([note]);
    const cue = cues[0];
    if (!cue) throw new Error("Missing reading finger cue");
    const xml = musicXmlWithLessonFingerCues(exercise.musicXml, cues, exercise.song.notes, (cue) =>
      lessonFingerLabel(cue, "ru")
    );
    const doc = new DOMParser().parseFromString(
      readingPromptXml(xml, "notes", 8).musicXml,
      "application/xml"
    );
    expect(doc.querySelectorAll('[data-lesson-finger-cue="true"]')).toHaveLength(1);
    expect(doc.querySelector("lyric > text")?.textContent).toBe(lessonFingerLabel(cue, "ru"));
    expect(exercise.musicXml).not.toContain("lesson-finger-cue");
    const cleared = musicXmlWithLessonFingerCues(xml, [], exercise.song.notes, (cue) =>
      lessonFingerLabel(cue, "ru")
    );
    expect(cleared).not.toContain("lesson-finger-cue");
    expect(songFromMusicXml(cleared, "").notes).toEqual(
      songFromMusicXml(exercise.musicXml, "").notes
    );
  });

  it("reserves the cue row with a text OSMD still draws but nobody sees", () => {
    // OSMD skips a label whose text trims to nothing; a zero-width space survives trim().
    expect(HIDDEN_LESSON_CUE.codePointAt(0)).toBe(0x200b);
    expect(HIDDEN_LESSON_CUE.trim()).toBe(HIDDEN_LESSON_CUE);
    const exercise = generateReadingExercise("notes", 22);
    const cues = lessonFingerCues(exercise.song.notes.slice(8, 9));
    const xml = musicXmlWithLessonFingerCues(
      exercise.musicXml,
      cues,
      exercise.song.notes,
      () => HIDDEN_LESSON_CUE
    );
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector('[data-lesson-finger-cue="true"] > text')?.textContent).toBe(
      HIDDEN_LESSON_CUE
    );
  });

  it("matches both hands by their stable IDs even in a later pair's reduced prompt", () => {
    const exercise = generateTwoHandExercise(9);
    const pair = exercise.pairs[7];
    if (!pair) throw new Error("Missing two hand pair");
    const notes = exercise.song.notes.filter((note) => pair.noteIds.includes(note.id));
    const cues = lessonFingerCues(notes);
    const prompt = twoHandPromptXml(exercise, 7, 0);
    const xml = musicXmlWithLessonFingerCues(prompt.musicXml, cues, exercise.song.notes, (cue) =>
      lessonFingerLabel(cue, "en")
    );
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    for (const cue of cues) {
      const element = Array.from(doc.querySelectorAll("note")).find(
        (note) => note.id === cue.noteId
      );
      expect(element?.querySelector("lyric > text")?.textContent).toBe(
        lessonFingerLabel(cue, "en")
      );
    }
    expect(doc.querySelectorAll('[data-lesson-finger-cue="true"]')).toHaveLength(2);
  });

  it("prepares solver fallback once for notes outside the beginner position", () => {
    const exercise = generateReadingExercise("notes", 1);
    const song = {
      ...exercise.song,
      notes: exercise.song.notes.map((note) => ({ ...note, pitch: note.pitch + 12 }))
    };
    expect(withLessonFingering(song).notes.every((note) => note.finger !== undefined)).toBe(true);
  });
});
