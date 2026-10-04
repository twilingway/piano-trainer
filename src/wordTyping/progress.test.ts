import { describe, expect, it } from "vitest";
import { PracticeSession } from "../practice/session";
import type { Song } from "../song/song";
import { generateWordTyping } from "./optimizer";
import { textProgress } from "./progress";

const song: Song = {
  title: "text cursor",
  source: "midi",
  duration: 3,
  beats: [],
  measures: [],
  notes: [
    { id: "first", pitch: 60, start: 0, duration: 1, startBeat: 0, hand: "right" },
    { id: "second", pitch: 62, start: 2, duration: 1, startBeat: 4, hand: "right" }
  ]
};
const tokens = generateWordTyping(song.notes, [{ word: "to", rank: 1 }], "en").tokens;
function statuses(session: PracticeSession) {
  return Object.fromEntries(song.notes.map((note) => [note.id, session.statusOf(note.id)]));
}
describe("text view reads the session", () => {
  it("skips notes outside the range and has no phantom pending notes after the range", () => {
    const session = new PracticeSession(song, {
      mode: "wait",
      hands: new Set(["right"]),
      speed: 1,
      from: 2,
      to: 3
    });
    expect(textProgress(tokens, statuses(session), session.time, false).index).toBe(1);
    session.advance(2);
    session.pressKey(62);
    expect(textProgress(tokens, statuses(session), session.time, false).index).toBe(-1);
  });
  it("uses song time for listen-through instead of missing player statuses", () => {
    const session = new PracticeSession(song, { mode: "tempo", hands: new Set(), speed: 1 });
    session.advance(2.5);
    const progress = textProgress(tokens, statuses(session), session.time, true);
    expect(progress.index).toBe(1);
    expect(progress.holding?.noteId).toBe("second");
    expect(progress.holdProgress).toBeCloseTo(0.5);
  });
  it("keeps the played hold while pointing to the next attack and resets after seek", () => {
    const session = new PracticeSession(song, {
      mode: "wait",
      hands: new Set(["right"]),
      speed: 1
    });
    session.advance(2);
    session.pressKey(60);
    session.advance(0.5);
    const progress = textProgress(tokens, statuses(session), session.time, false);
    expect(progress.index).toBe(1);
    expect(progress.holding?.noteId).toBe("first");
    expect(progress.holdProgress).toBeCloseTo(0.5);
    session.seek(0);
    const restarted = textProgress(tokens, statuses(session), session.time, false);
    expect(restarted.index).toBe(0);
    expect(restarted.holding).toBeUndefined();
  });
  it("does not advance on a wrong pitch", () => {
    const session = new PracticeSession(song, {
      mode: "wait",
      hands: new Set(["right"]),
      speed: 1
    });
    session.advance(2);
    session.pressKey(80);
    expect(textProgress(tokens, statuses(session), session.time, false).index).toBe(0);
    session.pressKey(60);
    expect(textProgress(tokens, statuses(session), session.time, false).index).toBe(1);
  });
});
