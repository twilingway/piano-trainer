// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateReadingExercise, nextReadingSeed, READING_PITCHES } from "./generator";
import { readingPromptXml } from "./prompt";
import { ReadingSession } from "./session";
import { DEFAULT_READING_PREFERENCES } from "./types";
import { songFromMusicXml } from "../song/musicxml";

function fixture(task: "notes" | "phrases" | "check" = "notes") {
  const exercise = generateReadingExercise(task, 42);
  const session = new ReadingSession(exercise, DEFAULT_READING_PREFERENCES);
  const note = exercise.song.notes[0];
  if (!note) throw new Error("Missing generated note");
  session.prepare(note.id, note.pitch, 0);
  session.setActive(true, 0);
  session.present(note.id, 100);
  return { exercise, session, note };
}
describe("reading source and presentation", () => {
  it("balances five pitches and reproduces the full XML and source song", () => {
    const a = generateReadingExercise("notes", 0),
      b = generateReadingExercise("notes", 0);
    expect(a.musicXml).toBe(b.musicXml);
    expect(a.song.notes).toEqual(b.song.notes);
    expect(a.song.notes).toHaveLength(20);
    for (const pitch of READING_PITCHES)
      expect(a.song.notes.filter((note) => note.pitch === pitch)).toHaveLength(4);
    expect(a.song.notes.every((note) => note.hand === "right" && note.duration === 0.5)).toBe(true);
    expect(a.song.duration).toBe(10);
    expect(a.musicXml).toContain("<staves>1</staves>");
    expect(a.musicXml).not.toContain("fingering");
    const changed = generateReadingExercise("notes", nextReadingSeed(a.seed, "notes"));
    expect(changed.song.notes.map((note) => note.pitch)).not.toEqual(
      a.song.notes.map((note) => note.pitch)
    );
  });
  it("selects the source note or its phrase and maps the local cursor", () => {
    const { exercise } = fixture();
    const single = readingPromptXml(exercise.musicXml, "notes", 7);
    const phrase = readingPromptXml(exercise.musicXml, "phrases", 7);
    expect(songFromMusicXml(single.musicXml, "").notes.map((note) => note.pitch)).toEqual([
      exercise.song.notes[7]?.pitch
    ]);
    expect(songFromMusicXml(phrase.musicXml, "").notes.map((note) => note.pitch)).toEqual(
      exercise.song.notes.slice(4, 8).map((note) => note.pitch)
    );
    expect(single.beat).toBe(0);
    expect(phrase.beat).toBe(3);
    expect(single.musicXml).toContain('id="reading-n7"');
    expect(() => readingPromptXml(exercise.musicXml, "notes", 20)).toThrow();
  });
});
describe("reading response and assistance", () => {
  it("does not accept before presentation and records wrong notes against the target", () => {
    const { session, note } = fixture();
    expect(session.answer(note.pitch, "midi", 99)).toBeNull();
    expect(session.answer(61, "keyboard", 200)).toMatchObject({
      expectedMidi: note.pitch,
      playedMidi: 61,
      responseLatencyMs: 100
    });
    session.answer(note.pitch, "pointer", 300);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: true,
      responseLatencyMs: 200
    });
    expect(session.answer(note.pitch, "midi", 400)).toBeNull();
  });
  it("counts only actual shown hints, including late delivery before a hint", () => {
    const { session, note } = fixture();
    expect(session.suggestHint(5100)).toBe(1);
    expect(session.snapshot().hintLevel).toBe(0);
    session.showHint(note.id, 1, 6000);
    session.answer(note.pitch, "midi", 5900);
    expect(session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: true,
      unassistedSolved: true,
      hintLevel: 0
    });
    const next = fixture();
    next.session.showHint(next.note.id, 1, 6000);
    next.session.answer(next.note.pitch, "midi", 6100);
    expect(next.session.snapshot().answers[0]).toMatchObject({
      firstAttemptCorrect: true,
      independentCorrect: false,
      unassistedSolved: false,
      hintLevel: 1
    });
  });
  it("excludes pauses, rejects paused answers and leaves a failed-render note unpresented", () => {
    const { session, note, exercise } = fixture();
    session.setActive(false, 150);
    expect(session.answer(note.pitch, "midi", 300)).toBeNull();
    session.setActive(true, 1000);
    session.answer(note.pitch, "midi", 1100);
    expect(session.snapshot().answers[0]?.responseLatencyMs).toBe(150);
    const next = exercise.song.notes[1];
    if (!next) throw new Error("Missing generated note");
    session.prepare(next.id, next.pitch, 1200);
    session.present(note.id, 1250);
    expect(session.answer(next.pitch, "midi", 1300)).toBeNull();
    expect(session.suggestHint(50000)).toBe(0);
  });
  it("never helps in check and permits manual help with automatic hints off", () => {
    const check = fixture("check");
    check.session.showHint(check.note.id, 2, 200);
    expect(check.session.suggestHint(50000)).toBe(0);
    expect(check.session.snapshot().hintLevel).toBe(0);
    const learning = fixture();
    learning.session.configure({ ...DEFAULT_READING_PREFERENCES, automaticHints: false });
    expect(learning.session.suggestHint(50000)).toBe(0);
    learning.session.showHint(learning.note.id, 2, 300);
    expect(learning.session.snapshot().hintLevel).toBe(2);
  });
  it("produces a result only for all 20 completed prompts", () => {
    const { exercise, session } = fixture();
    expect(session.result("run", 123)).toBeNull();
    exercise.song.notes.forEach((note, index) => {
      const at = 100 + index * 1000;
      session.prepare(note.id, note.pitch, at);
      session.present(note.id, at);
      session.answer(note.pitch, "midi", at + 100);
    });
    expect(session.result("run", 123)?.notes).toHaveLength(20);
    expect(session.result("run", 123)).toMatchObject({
      id: "run",
      seed: 42,
      task: "notes",
      createdAt: 123
    });
  });
});
