import { describe, expect, it, vi } from "vitest";
import type { KeyEvent } from "../input/midiInput";
import type { Song } from "../song/song";
import { PracticeSession } from "./session";
import type { PracticeEvent } from "./session";
import { ReadingAttackGate } from "./readingPolicy";
import type { CourseKeyContext } from "./trainerCourse";
import { musicCourse, type TrainerMusicPolicy } from "./musicPolicy";

const song: Song = {
  title: "music policy",
  source: "musicxml",
  duration: 1,
  notes: [{ id: "c", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }],
  measures: [],
  beats: []
};
const guidance = {
  lights: [60],
  frame: { hintNotes: [], due: [], waitingFor: [], hints: false, neutralKeys: true }
};
const event: KeyEvent = {
  type: "down",
  pitch: 60,
  velocity: 83,
  timestamp: 1000,
  source: "midi",
  deviceId: "piano-a",
  channel: 3
};
function harness(mode: "wait" | "tempo" = "wait", playing = true) {
  const session = new PracticeSession(song, { mode, speed: 1, hands: new Set(["right"]) });
  const policy: TrainerMusicPolicy = {
    inputCompensationMs: vi.fn(() => 777),
    onStart: vi.fn(() => true),
    onFrame: vi.fn(() => []),
    onInput: vi.fn(() => []),
    seedHeld: vi.fn(),
    cancel: vi.fn(),
    guidance: vi.fn(() => guidance)
  };
  const context: CourseKeyContext = {
    session,
    playing: () => playing,
    timing: {
      inputOffsets: { "piano-a": 20 },
      manualInputOffsetMs: 10,
      audioOffsetMs: 0,
      visualOffsetMs: 0
    },
    pressed: new Set(),
    gate: new ReadingAttackGate(),
    intercept: vi.fn(() => false),
    admits: vi.fn(() => true),
    times: vi.fn(() => ({ raw: 1000, corrected: 970, received: 1100 })),
    ordinary: vi.fn(),
    apply: vi.fn(),
    publish: vi.fn()
  };
  return { session, policy, context, course: musicCourse(policy) };
}

describe("one music TrainerCourse adapter", () => {
  it.each(["wait", "tempo"] as const)(
    "routes %s before any P1 waiting gate with original provenance",
    (mode) => {
      const h = harness(mode);
      expect(h.session.waiting).toBe(false);
      h.course.key(event, h.context);
      expect(h.policy.onInput).toHaveBeenCalledExactlyOnceWith(event, h.session, true, {
        raw: 1000,
        corrected: 970,
        received: 1100,
        admitted: true
      });
      expect(h.context.ordinary).not.toHaveBeenCalled();
      expect(h.context.pressed.has(60)).toBe(true);
      expect(h.context.publish).toHaveBeenCalledOnce();
    }
  );
  it("ticks the existing session before course input and applies its returned events", () => {
    const h = harness();
    const order: string[] = [];
    const tick = vi.spyOn(h.session, "tick").mockImplementation(() => {
      order.push("tick");
      return [];
    });
    const returned: readonly PracticeEvent[] = [{ type: "wrong", pitch: 60 }];
    vi.mocked(h.policy.onInput).mockImplementation(() => {
      order.push("input");
      return returned;
    });
    h.course.key(event, h.context);
    expect(order).toEqual(["tick", "input"]);
    expect(h.context.apply).toHaveBeenLastCalledWith(returned);
    expect(tick).toHaveBeenCalledWith(1100);
  });
  it("observes preparation and paused physical releases without advancing the song", () => {
    const h = harness("tempo", false);
    const tick = vi.spyOn(h.session, "tick");
    h.course.key({ ...event, type: "up" }, h.context);
    expect(h.policy.onInput).toHaveBeenCalledWith(
      { ...event, type: "up" },
      h.session,
      false,
      expect.objectContaining({ admitted: true })
    );
    expect(tick).not.toHaveBeenCalled();
    expect(h.context.pressed.size).toBe(0);
  });
  it("marks foreign or intercepted events unadmitted while preserving their physical evidence", () => {
    for (const rejected of ["device", "intercept"] as const) {
      const h = harness();
      const context = {
        ...h.context,
        admits: () => rejected !== "device",
        intercept: () => rejected === "intercept"
      };
      h.course.key(event, context);
      expect(h.policy.onInput).toHaveBeenCalledWith(
        event,
        h.session,
        true,
        expect.objectContaining({ admitted: false })
      );
      expect(context.pressed.has(60)).toBe(true);
    }
  });
  it("ignores invalid timing without inventing timestamps and forwards lifecycle capabilities", () => {
    const h = harness();
    h.course.key({ ...event, timestamp: NaN }, { ...h.context, times: () => undefined });
    expect(h.policy.onInput).not.toHaveBeenCalled();
    h.course.seed?.([event], 100);
    expect(h.policy.seedHeld).toHaveBeenCalledWith([event], 100);
    expect(h.course.start?.(h.session, 200, [event])).toBe(true);
    expect(h.policy.onStart).toHaveBeenCalledWith(h.session, 200, [event]);
    expect(h.course.step(h.session, false, 300)).toEqual([]);
    expect(h.policy.onFrame).toHaveBeenCalledWith(h.session, false, 300);
    h.course.cancel?.(400, true);
    expect(h.policy.cancel).toHaveBeenCalledWith(400, true);
    expect(h.course.guidance(h.session, true, false)).toBe(guidance);
    expect(h.course).toMatchObject({
      kind: "music",
      ownsInput: true,
      smoothClock: true,
      gradesRun: false,
      playsAfterFinish: true,
      overdrive: false
    });
    expect(h.course.attach).toBeUndefined();
    expect(h.course.inputCompensationMs?.()).toBe(777);
  });
});
