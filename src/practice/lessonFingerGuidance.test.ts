// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { PracticeSession } from "./session";
import { generateReadingExercise } from "../reading/generator";
import { generateHeldBassExercise } from "../reading/heldBassGenerator";
import {
  READING_PRACTICE_OPTIONS,
  trainerGuidance,
  type TrainerReadingPolicy
} from "./readingPolicy";
import { pairGuidance } from "./twoHandPolicy";
import { independentRhythmGuidance } from "./independentRhythmPolicy";
import { lessonFingerCues } from "../reading/fingerCues";

describe("authorized finger guidance", () => {
  it("exposes no reading finger before key-level permission, in control, or after pause", () => {
    const session = new PracticeSession(
      generateReadingExercise("notes", 1).song,
      READING_PRACTICE_OPTIONS
    );
    let cue: number | undefined;
    const policy = { cuePitch: () => cue } as TrainerReadingPolicy;
    expect(trainerGuidance(session, policy, true, false).frame.fingerCues).toEqual([]);
    const due = session.nextDue()[0];
    if (!due) throw new Error("Missing due note");
    cue = due.pitch;
    expect(trainerGuidance(session, policy, true, false).frame.fingerCues).toEqual(
      lessonFingerCues(session.nextDue())
    );
    expect(trainerGuidance(session, policy, false, false).frame.fingerCues).toEqual([]);
    cue = undefined;
    expect(trainerGuidance(session, policy, true, false).frame.fingerCues).toEqual([]);
    expect(trainerGuidance(session, null, true, false).frame).not.toHaveProperty("fingerCues");
  });

  it("preserves same-pitch simultaneous hands and removes them when permission moves", () => {
    const notes: readonly SongNote[] = [
      { id: "left", pitch: 60, hand: "left", finger: 5, start: 0, startBeat: 0, duration: 1 },
      { id: "right", pitch: 60, hand: "right", finger: 1, start: 0, startBeat: 0, duration: 1 }
    ];
    const session = { nextDue: () => notes } as unknown as PracticeSession;
    let pitches = [60];
    const policy = { cuePitches: () => pitches };
    const frame = pairGuidance(session, policy, true).frame;
    expect(frame.neutralKeys).toBe(true);
    expect(frame.fingerCues).toHaveLength(2);
    expect(frame.fingerCues.map((cue) => cue.hand)).toEqual(["left", "right"]);
    pitches = [];
    expect(pairGuidance(session, policy, true).frame.fingerCues).toEqual([]);
  });

  it("keeps an authorized held bass cue alongside the current melody, never a future note", () => {
    const fragment = generateHeldBassExercise(5).fragments[0];
    if (!fragment) throw new Error("Missing held bass fragment");
    const current = fragment.song.notes.find((note) => note.id === fragment.melodyNoteIds[1]);
    if (!current) throw new Error("Missing melody note");
    const session = {
      song: fragment.song,
      time: 0.5,
      nextDue: () => [current]
    } as unknown as PracticeSession;
    const frame = pairGuidance(
      session,
      { cuePitches: () => [fragment.bassPitch, current.pitch] },
      true,
      true
    ).frame;
    expect(frame.fingerCues.map((cue) => cue.noteId).sort()).toEqual(
      [fragment.bassNoteId, current.id].sort()
    );
  });

  it("removes preparation-only rhythm cues once their existing permission ends", () => {
    const note: SongNote = {
      id: "n",
      pitch: 60,
      hand: "right",
      finger: 1,
      start: 0,
      startBeat: 0,
      duration: 1
    };
    let pitches = [60];
    const policy = { cuePitches: () => pitches };
    const session = { song: { notes: [note] } } as unknown as PracticeSession;
    expect(independentRhythmGuidance(policy, session).frame.fingerCues).toHaveLength(1);
    pitches = [];
    expect(independentRhythmGuidance(policy, session).frame.fingerCues).toEqual([]);
  });
});
