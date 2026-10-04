import { describe, expect, it } from "vitest";

import type { Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { LEAD_IN_S, PracticeSession } from "./session";
import type { PracticeMode } from "./session";

const note = (id: string, pitch: number, start: number, hand: Hand = "right"): SongNote => ({
  id,
  pitch,
  start,
  duration: 0.5,
  startBeat: start,
  hand
});

// Right hand: C4 at 0, an E4-G4 chord at 1. Left hand: C3 at 0.
const SONG: Song = {
  title: "test",
  source: "midi",
  notes: [note("c3", 48, 0, "left"), note("c4", 60, 0), note("e4", 64, 1), note("g4", 67, 1)],
  measures: [],
  beats: [
    { time: 0, position: 0, downbeat: true },
    { time: 0.5, position: 0.5, downbeat: false },
    { time: 1, position: 1, downbeat: false }
  ],
  duration: 1.5
};

const session = (mode: PracticeMode, hands: Hand[] = ["right"], speed = 1) =>
  new PracticeSession(SONG, { mode, hands: new Set(hands), speed });

describe("wait mode", () => {
  it("holds the song at the owed note until it is pressed", () => {
    const run = session("wait");
    run.advance(LEAD_IN_S + 5);
    expect(run.time).toBe(0);
    expect(run.waiting).toBe(true);
    expect(run.pressKey(60)).toEqual([{ type: "hit", noteId: "c4", offset: 0 }]);
    run.advance(5);
    expect(run.time).toBe(1);
  });

  it("waits for every key of a chord and counts a wrong key without moving on", () => {
    const run = session("wait");
    run.advance(LEAD_IN_S);
    run.pressKey(60);
    run.advance(1);
    expect(run.pressKey(62)).toEqual([{ type: "wrong", pitch: 62 }]);
    run.pressKey(64);
    expect(run.waiting).toBe(true);
    run.pressKey(67);
    expect(run.waiting).toBe(false);
    expect(run.stats()).toMatchObject({ hits: 3, misses: 0, wrong: 1 });
  });

  it("does not accept a key long before the song reaches its note", () => {
    const run = session("wait");
    expect(run.pressKey(60)).toEqual([{ type: "wrong", pitch: 60 }]);
  });
});

describe("tempo mode", () => {
  it("counts a key inside the window as a hit with its timing error", () => {
    const run = session("tempo");
    run.advance(LEAD_IN_S + 0.1);
    const [event] = run.pressKey(60);
    expect(event?.type).toBe("hit");
    expect(event?.type === "hit" ? event.offset : NaN).toBeCloseTo(0.1);
  });

  it("marks a note missed once the song passes its window", () => {
    const run = session("tempo");
    const events = run.advance(LEAD_IN_S + 0.5);
    expect(events).toContainEqual({ type: "miss", noteId: "c4" });
    expect(run.pressKey(60)).toEqual([{ type: "wrong", pitch: 60 }]);
  });

  it("scales the window by the speed", () => {
    const run = session("tempo", ["right"], 0.5);
    // 0.8 real seconds after the note at half speed is 0.4 song seconds: too late.
    run.advance(LEAD_IN_S * 2 + 0.8);
    expect(run.statusOf("c4")).toBe("missed");
  });
});

describe("the owed note", () => {
  const close: Song = { ...SONG, notes: [note("a", 60, 0), note("b", 62, 0.2)] };

  it("is the pending note nearest the song time in tempo mode, not one still in its late window", () => {
    const run = new PracticeSession(close, { mode: "tempo", hands: new Set(["right"]), speed: 1 });
    run.advance(LEAD_IN_S + 0.15);
    expect(run.statusOf("a")).toBe("pending");
    expect(run.nextDue()[0]?.id).toBe("a");
    expect(run.owedNote()?.id).toBe("b");
  });

  it("is the first owed note in wait mode", () => {
    const run = new PracticeSession(close, { mode: "wait", hands: new Set(["right"]), speed: 1 });
    run.advance(LEAD_IN_S + 0.15);
    expect(run.owedNote()?.id).toBe("a");
  });
});

describe("the other hand", () => {
  it("is played by the program and stopped when its note ends", () => {
    const run = session("tempo");
    const started = run.advance(LEAD_IN_S);
    expect(started).toContainEqual({ type: "autoNoteOn", pitch: 48 });
    expect(run.advance(0.6)).toContainEqual({ type: "autoNoteOff", pitch: 48 });
  });

  it("finishes a listen-only run by itself", () => {
    const run = session("tempo", []);
    const events = run.advance(LEAD_IN_S + 2);
    expect(events).toContainEqual({ type: "autoNoteOn", pitch: 67 });
    const tail = run.advance(0.1);
    expect(tail).toContainEqual({ type: "finished" });
    expect(run.finished).toBe(true);
  });
});

describe("metronome", () => {
  const beatsOf = (events: readonly { type: string }[]) =>
    events.filter((event) => event.type === "beat");

  it("counts in over the lead-in at the song's beat interval", () => {
    const run = session("tempo");
    // Lead-in of 2 s at 0.5 s per beat: clicks at -2, -1.5, -1, -0.5.
    expect(beatsOf(run.advance(LEAD_IN_S - 0.01))).toHaveLength(4);
  });

  it("marks the first beat of a measure and stays silent while the wait mode waits", () => {
    const run = session("wait");
    const atStart = beatsOf(run.advance(LEAD_IN_S + 3));
    expect(atStart.at(-1)).toEqual({ type: "beat", downbeat: true });
    expect(beatsOf(run.advance(3))).toHaveLength(0);
    run.pressKey(60);
    expect(beatsOf(run.advance(0.6))).toEqual([{ type: "beat", downbeat: false }]);
  });
});

describe("seek", () => {
  it("skips earlier notes without counting them and waits for the chosen one", () => {
    const run = session("wait");
    run.advance(LEAD_IN_S);
    run.pressKey(62);
    run.seek(1);
    expect(run.statusOf("c4")).toBe("skipped");
    expect(run.stats()).toMatchObject({ hits: 0, misses: 0, wrong: 0 });
    expect(run.time).toBe(1 - LEAD_IN_S);
    run.advance(LEAD_IN_S + 1);
    expect(run.time).toBe(1);
    expect(run.nextDue().map((note) => note.id)).toEqual(["e4", "g4"]);
  });

  it("does not mark skipped notes missed in tempo mode or replay the other hand before the point", () => {
    const run = session("tempo");
    run.seek(1);
    const events = run.advance(LEAD_IN_S + 0.1);
    expect(events).not.toContainEqual({ type: "miss", noteId: "c4" });
    expect(events).not.toContainEqual({ type: "autoNoteOn", pitch: 48 });
    expect(run.statusOf("c4")).toBe("skipped");
  });

  it("counts the player in with the song's own beats before the point", () => {
    const run = session("tempo");
    run.seek(1);
    // Lead-in from -1 to 1: count-in clicks at -1 and -0.5, then the song's 0, 0.5 and 1.
    const clicks = run.advance(LEAD_IN_S).filter((event) => event.type === "beat");
    expect(clicks).toHaveLength(5);
  });
});

describe("listening", () => {
  it("starts on the first note with no run-up and no burst of count-in clicks", () => {
    const run = session("tempo", []);
    expect(run.time).toBe(0);
    const events = run.advance(0.01);
    expect(events).toContainEqual({ type: "autoNoteOn", pitch: 60 });
    expect(events.filter((event) => event.type === "beat")).toEqual([
      { type: "beat", downbeat: true }
    ]);
  });

  it("resumes right on the chosen note after a seek", () => {
    const run = session("tempo", []);
    run.seek(1);
    expect(run.time).toBe(1);
    const events = run.advance(0.01);
    expect(events).toContainEqual({ type: "autoNoteOn", pitch: 64 });
    expect(events).not.toContainEqual({ type: "autoNoteOn", pitch: 60 });
  });
});

describe("timestamp clock", () => {
  it("gives the same event-time judgement at 15 and 60 FPS", () => {
    const results = [15, 60].map((fps) => {
      const run = session("tempo");
      run.startClock(1000);
      for (let frame = 1; frame <= Math.floor(2.22 * fps); frame++)
        run.tick(1000 + (frame * 1000) / fps);
      expect(run.statusOf("c4")).toBe("pending");
      const hit = run.pressKeyAt(60, 3030, 3220);
      expect(hit[0]?.type).toBe("hit");
      expect(hit[0]?.type === "hit" ? hit[0].offset : NaN).toBeCloseTo(0.03);
      return run.stats().game;
    });
    expect(results[0]?.grades.PERFECT).toBe(1);
    expect(results[0]?.score).toBe(results[1]?.score);
  });
  it("expires pending notes after the delivery grace, not the last frame window", () => {
    const run = session("tempo");
    run.startClock(0);
    run.tick(2399);
    expect(run.statusOf("c4")).toBe("pending");
    run.tick(2401);
    expect(run.statusOf("c4")).toBe("missed");
  });
  it("adds positive input compensation to the callback delivery horizon", () => {
    const run = session("tempo");
    run.setInputGrace(110);
    run.startClock(0);
    // Raw event 2250 ms, callback 2500 ms, corrected attack 2140 ms.
    run.tick(2500);
    expect(run.statusOf("c4")).toBe("pending");
    expect(run.pressKeyAt(60, 2250 - 110, 2500)[0]).toMatchObject({ type: "hit", judgement: "OK" });
    const negative = session("tempo");
    negative.setInputGrace(-100);
    negative.startClock(0);
    negative.tick(2401);
    expect(negative.statusOf("c4")).toBe("missed");
  });
  it("anchors wait at the exact crossing and resumes without consuming waiting time", () => {
    const run = session("wait");
    run.startClock(0);
    run.tick(9000);
    expect(run.songTimeAt(8000)).toBe(0);
    expect(run.performanceTimeAt(1)).toBeUndefined();
    run.pressKeyAt(60, 9000);
    run.tick(9500);
    expect(run.time).toBe(0.5);
    run.tick(12000);
    expect(run.time).toBe(1);
  });
  it("maps speed and pause, rejects stale preseek events", () => {
    const run = session("tempo", ["right"], 0.5);
    run.startClock(0);
    run.pauseClock(2000);
    expect(run.time).toBe(-1);
    run.tick(7000);
    expect(run.time).toBe(-1);
    run.resumeClock(7000);
    run.tick(9000);
    expect(run.time).toBe(0);
    expect(run.songTimeAt(4000)).toBeUndefined();
    expect(run.performanceTimeAt(1)).toBe(11000);
    run.seek(1, 10000);
    expect(run.pressKeyAt(64, 9000)).toEqual([]);
  });
  it("accepts a callback from before pause, but ignores keys physically pressed in pause", () => {
    const run = session("tempo");
    run.startClock(0);
    run.pauseClock(2200);
    expect(run.pressKeyAt(60, 2030, 2250)[0]?.type).toBe("hit");
    expect(run.pressKeyAt(62, 2230)).toEqual([]);
  });
  it("caps a late pre-pause attack hold at pause and maps a physical release during pause", () => {
    const run = session("tempo");
    run.startClock(0);
    run.pauseClock(2200);
    run.pressKeyAt(60, 2030, 2250);
    run.releaseKeyAt(60, 3000);
    run.resumeClock(4000);
    run.tick(4500);
    expect(run.stats().hold?.heldSeconds).toBeCloseTo(0.17);
    expect(run.stats().hold?.releasedNotes).toBe(1);
    expect(run.stats().game?.holdScore).toBe(10);
  });
  it("ends accompaniment at the chosen segment boundary", () => {
    const song = {
      ...SONG,
      notes: [{ ...note("long", 48, 0.5, "left"), duration: 5 }],
      duration: 5.5
    };
    const run = new PracticeSession(song, {
      mode: "tempo",
      hands: new Set(),
      speed: 1,
      from: 0,
      to: 1
    });
    run.startClock(0);
    expect(run.tick(500)).toContainEqual({ type: "autoNoteOn", pitch: 48 });
    expect(run.tick(1000)).toContainEqual({ type: "autoNoteOff", pitch: 48 });
    expect(run.tick(1250)).toContainEqual({ type: "finished" });
  });
  it("ignores extra keys in a rest but breaks combo in an active window", () => {
    const run = session("tempo");
    run.startClock(0);
    expect(run.pressKeyAt(62, 100)).toEqual([]);
    expect(run.pressKeyAt(62, 2000)).toEqual([{ type: "wrong", pitch: 62 }]);
  });
  it("finalizes a partial chord once and stops hold bonus on an early release", () => {
    const run = session("tempo");
    run.startClock(0);
    run.tick(2000);
    run.pressKeyAt(60, 2000);
    run.releaseKeyAt(60, 2250);
    expect(run.stats().game?.holdScore).toBe(20);
    run.tick(3000);
    run.pressKeyAt(64, 3000);
    run.tick(3450);
    run.tick(3460);
    expect(run.stats().game?.partialChords).toBe(1);
  });
});
