import { beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeSession } from "../practice/session";
import type { Song, SongNote } from "../song/song";
import { SessionAudio } from "./sessionAudio";

const sound = vi.hoisted(() => ({
  clock: 10,
  nextJob: 0,
  queued: new Map<number, { at: number; action: (at: number) => void }>(),
  cancelled: vi.fn(),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  click: vi.fn(),
  cancelVoices: vi.fn()
}));

vi.mock("./pianoSound", () => ({
  audioTime: () => sound.clock,
  scheduleSound: (at: number, action: (at: number) => void) => {
    const id = ++sound.nextJob;
    sound.queued.set(id, { at, action });
    return id;
  },
  cancelScheduledSound: (id: number) => {
    sound.cancelled(id);
    sound.queued.delete(id);
  }
}));
vi.mock("./scheduledVoices", () => ({
  scheduledNoteOn: sound.noteOn,
  scheduledNoteOff: sound.noteOff,
  scheduledClick: sound.click,
  cancelScheduledVoices: sound.cancelVoices
}));

const note = (id: string, start: number, hand: "left" | "right" = "left"): SongNote => ({
  id,
  pitch: hand === "left" ? 48 : 60,
  start,
  startBeat: start * 2,
  duration: 0.2,
  hand,
  velocity: 90
});

function session(notes: readonly SongNote[], mode: "tempo" | "wait" = "tempo", to?: number) {
  const song: Song = {
    title: "test",
    source: "midi",
    notes,
    beats: [
      { time: 0, position: 0, downbeat: true },
      { time: 0.5, position: 1, downbeat: false }
    ],
    measures: [],
    duration: 2
  };
  const result = new PracticeSession(song, {
    mode,
    hands: new Set(["right"]),
    speed: 1,
    ...(to === undefined ? {} : { to })
  });
  result.startClock(1000);
  return result;
}

function flushQueued(): void {
  for (const [id, job] of [...sound.queued]) {
    sound.queued.delete(id);
    job.action(job.at);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  sound.clock = 10;
  sound.nextJob = 0;
  sound.queued.clear();
});

describe("session audio scheduling", () => {
  it("restores the remainder of a sustained automatic note after pause", () => {
    const run = session([{ ...note("held", 0), duration: 2 }]);
    run.tick(4000);
    run.pauseClock(4000);
    run.resumeClock(5000);
    const audio = new SessionAudio();
    audio.reset(5000);
    audio.schedule(run, 5000, 0, false);
    flushQueued();
    expect(sound.noteOn).toHaveBeenCalledWith(48, 90, 10, "held", 1);
    audio.schedule(run, 5800, 0, false);
    flushQueued();
    expect(sound.noteOff).toHaveBeenCalledWith(48, 11, "held");
    expect(sound.noteOn).toHaveBeenCalledTimes(1);
  });
  it("does not create an automatic attack at the excluded segment end", () => {
    const run = session([note("inside", 0.9), note("excluded", 1)], "tempo", 1);
    const audio = new SessionAudio();
    audio.reset(1000);
    audio.schedule(run, 3800, 0, false);
    flushQueued();
    expect(sound.noteOn).toHaveBeenCalledTimes(1);
    expect(sound.noteOn).toHaveBeenCalledWith(48, 90, 12.9, "inside");
    expect(sound.noteOff).toHaveBeenCalledWith(48, 13, "inside");
  });

  it("schedules a count-in click before its expected heard time by audio offset", () => {
    const run = session([note("player", 0, "right")]);
    const audio = new SessionAudio();
    audio.reset(1000);
    // The beat at song -1 occurs at performance 2000/audio 11.
    audio.schedule(run, 1800, 100, true);
    flushQueued();
    expect(sound.click).toHaveBeenCalledWith(false, 10.9);
    expect(sound.noteOn).not.toHaveBeenCalled();
  });

  it("never schedules the other hand beyond a waiting chord", () => {
    const run = session([note("player", 0, "right"), note("same", 0), note("after", 0.1)], "wait");
    const audio = new SessionAudio();
    audio.reset(1000);
    audio.schedule(run, 2900, 0, false);
    flushQueued();
    expect(sound.noteOn).toHaveBeenCalledTimes(1);
    expect(sound.noteOn).toHaveBeenCalledWith(48, 90, 12, "same");
    expect(sound.noteOff).not.toHaveBeenCalled();
    audio.schedule(run, 8000, 0, false);
    flushQueued();
    expect(sound.noteOn).toHaveBeenCalledTimes(1);
  });

  it("deduplicates pumps and reset cancels callbacks and previously created voices", () => {
    const run = session([note("automatic", 0)]);
    const audio = new SessionAudio();
    audio.reset(1000);
    audio.schedule(run, 2800, 0, true);
    const queued = sound.queued.size;
    audio.schedule(run, 2850, 0, true);
    expect(sound.queued.size).toBe(queued);
    // A Tone callback can already have constructed a future-start voice.
    const attack = [...sound.queued].find(([, job]) => job.at === 12);
    expect(attack).toBeDefined();
    if (!attack) throw new Error("Expected queued attack");
    sound.queued.delete(attack[0]);
    attack[1].action(attack[1].at);
    audio.reset(2850);
    expect(sound.cancelled).toHaveBeenCalled();
    expect(sound.queued.size).toBe(0);
    expect(sound.cancelVoices).toHaveBeenCalledTimes(2);
  });
});
