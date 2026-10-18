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
  cancelVoices: vi.fn(),
  voiceReady: true,
  voiceStart: vi.fn(),
  voiceStop: vi.fn()
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
vi.mock("./voiceTrack", () => ({
  voiceTrackReady: () => sound.voiceReady,
  startVoiceTrack: sound.voiceStart,
  stopVoiceTrack: sound.voiceStop
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

it.each([60, 80, 100])(
  "schedules all four count-in beats at %s BPM, then stops at score end",
  (bpm) => {
    const beatS = 60 / bpm;
    const practice = new PracticeSession(
      {
        title: "rhythm",
        source: "midi",
        notes: [],
        measures: [],
        duration: 16 * beatS,
        beats: Array.from({ length: 17 }, (_, index) => ({
          time: index * beatS,
          position: index,
          downbeat: index % 4 === 0
        }))
      },
      {
        mode: "tempo",
        hands: new Set(["right"]),
        speed: 1,
        countInBeats: 4,
        accompaniment: false,
        noteResult: false
      }
    );
    practice.startClock(1000);
    const scheduler = new SessionAudio();
    scheduler.reset(1000);
    for (let beat = -4; beat <= 16; beat++) {
      scheduler.schedule(practice, 1000 + (beat + 4) * beatS * 1000, 0, true);
      flushQueued();
    }
    expect(sound.click).toHaveBeenCalledTimes(20);
    expect(sound.noteOn).not.toHaveBeenCalled();
    scheduler.reset(1000);
  }
);

function session(
  notes: readonly SongNote[],
  mode: "tempo" | "wait" = "tempo",
  to?: number,
  { voice, speed = 1 }: { voice?: string; speed?: number } = {}
) {
  const song: Song = {
    title: "test",
    source: "midi",
    notes,
    beats: [
      { time: 0, position: 0, downbeat: true },
      { time: 0.5, position: 1, downbeat: false }
    ],
    measures: [],
    duration: 2,
    ...(voice === undefined ? {} : { voice })
  };
  const result = new PracticeSession(song, {
    mode,
    hands: new Set(["right"]),
    speed,
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
  sound.voiceReady = true;
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

  it("plays the player's note that lies outside their keyboard", () => {
    const song: Song = {
      title: "test",
      source: "midi",
      notes: [note("high", 0.9, "right")],
      beats: [],
      measures: [],
      duration: 2
    };
    const run = new PracticeSession(song, {
      mode: "tempo",
      hands: new Set(["right"]),
      speed: 1,
      playable: { low: 72, high: 84 }
    });
    run.startClock(1000);
    const audio = new SessionAudio();
    audio.reset(1000);
    audio.schedule(run, 3800, 0, false);
    flushQueued();
    expect(sound.noteOn).toHaveBeenCalledWith(60, 90, 12.9, "high");
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

describe("a lesson's voice track", () => {
  it("starts at song time 0 on the same anchor and offset as the notes", () => {
    const run = session([note("player", 0, "right")], "tempo", undefined, { voice: "v.mp3" });
    const audio = new SessionAudio();
    audio.reset(1000);
    // Song 0 is performance 3000 after the lead-in: audio 12, heard 0.1 s early by the offset.
    audio.schedule(run, 2800, 100, false);
    flushQueued();
    expect(sound.voiceStart).toHaveBeenCalledWith("v.mp3", 11.9, 0);
    audio.schedule(run, 3200, 100, false);
    flushQueued();
    expect(sound.voiceStart).toHaveBeenCalledTimes(1);
  });

  it("resumes from the current second, and stops on reset", () => {
    const run = session([note("player", 0, "right")], "tempo", undefined, { voice: "v.mp3" });
    run.tick(4000);
    run.pauseClock(4000);
    run.resumeClock(5000);
    const audio = new SessionAudio();
    audio.reset(5000);
    expect(sound.voiceStop).toHaveBeenCalledTimes(1);
    audio.schedule(run, 5000, 0, false);
    flushQueued();
    expect(sound.voiceStart).toHaveBeenCalledWith("v.mp3", 10, 1);
    audio.reset(5500);
    expect(sound.voiceStop).toHaveBeenCalledTimes(2);
  });

  it("waits for its file, then starts from the second it is ready", () => {
    const run = session([note("player", 0, "right")], "tempo", undefined, { voice: "v.mp3" });
    const audio = new SessionAudio();
    audio.reset(1000);
    sound.voiceReady = false;
    audio.schedule(run, 3000, 0, false);
    flushQueued();
    expect(sound.voiceStart).not.toHaveBeenCalled();
    sound.voiceReady = true;
    audio.schedule(run, 3500, 0, false);
    flushQueued();
    expect(sound.voiceStart).toHaveBeenCalledWith("v.mp3", 12.5, 0.5);
  });

  it("stops at the end of the chosen range", () => {
    const run = session([note("player", 0, "right")], "tempo", 1, { voice: "v.mp3" });
    const audio = new SessionAudio();
    audio.reset(1000);
    audio.schedule(run, 3800, 0, false);
    flushQueued();
    expect(sound.voiceStop).toHaveBeenLastCalledWith(13);
  });

  it.each([
    ["wait mode", "wait" as const, 1],
    ["a slower speed", "tempo" as const, 0.75]
  ])("stays silent in %s", (_, mode, speed) => {
    const run = session([note("player", 0, "right")], mode, undefined, { voice: "v.mp3", speed });
    const audio = new SessionAudio();
    audio.reset(1000);
    audio.schedule(run, 4000, 0, false);
    flushQueued();
    expect(sound.voiceStart).not.toHaveBeenCalled();
  });
});
