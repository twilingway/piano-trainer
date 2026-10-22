// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntervalPreviewRequest } from "../audio/intervalPreview";
import type { KeyEvent } from "../input/midiInput";
import type { IntervalMode, IntervalInputSource } from "../intervals/types";
import { INTERVAL_CATEGORIES } from "../intervals/types";
import { PracticeSession } from "../practice/session";
import { READING_PRACTICE_OPTIONS } from "../practice/readingPolicy";
import { Trainer } from "../practice/Trainer";
import type { FallingNotesView } from "../render/FallingNotesView";
import { validIntervalResult } from "./intervalPersistence";
import { createMemoryReadingRepository } from "./readingRepository";
import { normalizeReadingState } from "./readingMigration";
import { readingActions } from "./readingSlice";
import { songActions } from "./songSlice";
import { createAppStore, type AppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { useIntervalCourse } from "./useIntervalCourse";
import { useIntervalAudioTrainer } from "./useIntervalAudio";
import { useReadingCourse, useReadingTrainer } from "./useReadingCourse";

interface PreviewStub {
  current: IntervalPreviewRequest | null;
  requests: IntervalPreviewRequest[];
  started: boolean;
  disposed: boolean;
  play: ReturnType<typeof vi.fn<(request: IntervalPreviewRequest) => Promise<boolean>>>;
  cancel: ReturnType<typeof vi.fn<() => void>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
}
const audio = vi.hoisted(() => ({ owners: [] as PreviewStub[] }));
vi.mock("../audio/pianoSound", () => ({ soundAllOff: vi.fn() }));
vi.mock("../audio/sessionAudio", () => ({
  SessionAudio: class {
    start = vi.fn();
    reset = vi.fn();
    schedule = vi.fn();
  }
}));
vi.mock("../audio/intervalPreview", () => ({
  createIntervalPreview: () => {
    const owner: PreviewStub = {
      current: null,
      requests: [],
      started: false,
      disposed: false,
      play: vi.fn((request: IntervalPreviewRequest) => {
        owner.current = request;
        owner.requests.push(request);
        owner.started = false;
        return Promise.resolve(true);
      }),
      cancel: vi.fn(() => {
        const request = owner.current;
        owner.current = null;
        request?.onCancelled({ partial: owner.started });
      }),
      dispose: vi.fn(() => {
        owner.disposed = true;
        owner.cancel();
      })
    };
    audio.owners.push(owner);
    return owner;
  }
}));

let root: Root;
let host: HTMLDivElement;
let store: AppStore;
let repository: ReturnType<typeof createMemoryReadingRepository>;
let interval: ReturnType<typeof useIntervalCourse>;
let reading: ReturnType<typeof useReadingCourse>;
let now: number;
let visible: DocumentVisibilityState;
let mounted: boolean;
const configureCourse = vi.fn();
const setPlaying = vi.fn();
const trainerRef = { current: { configureCourse, setPlaying } as unknown as Trainer };

function Harness({ blocked = false }: { blocked?: boolean }) {
  const p2 = useReadingCourse();
  const p3 = useIntervalCourse();
  useReadingTrainer(p3.active ? p3 : p2, trainerRef, true, blocked);
  useIntervalAudioTrainer(p3.audio, p3.session, trainerRef, true, blocked, p3.publish);
  useEffect(() => {
    interval = p3;
    reading = p2;
  });
  return null;
}
function render(blocked = false) {
  act(() => {
    root.render(withTestStore(<Harness blocked={blocked} />, store));
  });
}
function at(timestamp: number, command: () => void) {
  now = timestamp;
  act(command);
}
function select(mode: IntervalMode) {
  at(now, () => store.dispatch(readingActions.intervalSelected({ mode, seed: 42 })));
}
function practiceForVisual() {
  select("see-and-play");
  if (!interval.exercise) throw new Error("No interval exercise");
  const practice = new PracticeSession(interval.exercise.song, READING_PRACTICE_OPTIONS);
  practice.seek(0, now, { leadIn: false });
  frame(practice, now);
  return practice;
}
function frame(practice: PracticeSession, timestamp: number, playing = true) {
  at(timestamp, () => {
    practice.tick(timestamp);
    interval.policy?.onFrame(practice, playing, timestamp);
  });
}
function present() {
  at(now, () => {
    const presentation = interval.presentation;
    if (presentation) presentation.onPresented(presentation.id, now);
  });
}
function key(practice: PracticeSession, pitch: number, source: IntervalInputSource): KeyEvent {
  return { type: "down", pitch, velocity: 90, source, timestamp: now };
}
function accepts(practice: PracticeSession) {
  return interval.policy?.allowInput(
    key(practice, practice.nextDue()[0]?.pitch ?? 60, "keyboard"),
    practice,
    now
  );
}
function pitch(practice: PracticeSession, value: number, source: IntervalInputSource = "keyboard") {
  at(now + 100, () => {
    const input = key(practice, value, source);
    expect(interval.policy?.allowInput(input, practice, now)).toBe(true);
    interval.policy?.onJudgement(input, practice.pressKeyAt(value, now), now, now);
    practice.releaseKeyAt(value, now + 1, source);
  });
}
function expected(practice: PracticeSession, source: IntervalInputSource = "keyboard") {
  const value = practice.nextDue()[0]?.pitch;
  if (value === undefined) throw new Error("No expected practice note");
  pitch(practice, value, source);
}
function nextVisual(practice: PracticeSession) {
  frame(practice, now + 650);
  present();
}
function owner() {
  const preview = audio.owners.findLast((value) => !value.disposed);
  if (!preview) throw new Error("No active audio owner");
  return preview;
}
function listen() {
  at(now, () => {
    interval.audio.listen();
  });
  const preview = owner();
  if (!preview.current) throw new Error("No audio reference requested");
  return preview.current;
}
function complete(delay = 1500) {
  const preview = owner();
  const request = preview.current;
  if (!request) throw new Error("No pending reference");
  preview.current = null;
  at(now + delay, request.onCompleted);
}
function choose(source: "keyboard" | "pointer" = "keyboard", wrong = false) {
  const category = interval.pair?.category;
  if (!category) throw new Error("No active pair");
  const choice = wrong ? INTERVAL_CATEGORIES.find((value) => value !== category) : category;
  if (!choice) throw new Error("No category");
  at(now + 100, () => {
    interval.audio.answer(choice, source);
  });
}
function visibility(state: DocumentVisibilityState) {
  visible = state;
  at(now + 100, () => document.dispatchEvent(new Event("visibilitychange")));
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  now = 1000;
  visible = "visible";
  mounted = true;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  configureCourse.mockClear();
  setPlaying.mockClear();
  audio.owners.length = 0;
  repository = createMemoryReadingRepository();
  store = createAppStore({
    storage: { getItem: () => null, setItem: () => undefined },
    readingRepository: repository
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  render();
  await act(async () => {
    await store.readingPersistenceReady;
  });
});
afterEach(() => {
  if (mounted)
    act(() => {
      root.unmount();
    });
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("interval course visual integration", () => {
  it("finishes every pair when staff acknowledgement follows a later Trainer timestamp in the same frame", () => {
    const practice = practiceForVisual();
    present();
    expected(practice);
    nextVisual(practice);
    expected(practice);
    expect(interval.snapshot?.questionIndex).toBe(1);

    for (let question = 1; question < 10; question++) {
      frame(practice, now + 1);
      expect(interval.snapshot?.active).toBe(false);
      frame(practice, now + 650);
      const frameStart = now - 1;
      at(now + 1, () => {
        const presentation = interval.presentation;
        presentation?.onPresented(presentation.id, frameStart);
      });
      expect(interval.snapshot?.presented).toBe(true);
      expect(accepts(practice)).toBe(true);
      expected(practice);
      nextVisual(practice);
      expected(practice);
      expect(interval.snapshot?.questionIndex).toBe(question + 1);
    }
    expect(interval.snapshot?.completed).toBe(true);
    expect(interval.result?.questions).toHaveLength(10);
    expect(store.getState().reading.intervals.history).toHaveLength(1);
  });

  it("releases a held MIDI attack through ear mode before the next visual series", () => {
    select("see-and-play");
    if (!interval.exercise) throw new Error("Missing exercise");
    const real = new Trainer({
      onTick: vi.fn(),
      setSong: vi.fn(),
      draw: vi.fn()
    } as unknown as FallingNotesView);
    const first = interval.exercise.song.notes[0];
    if (!first) throw new Error("Missing first note");
    real.configureCourse("reading", interval.policy);
    real.load(interval.exercise.song, READING_PRACTICE_OPTIONS, interval.exercise.id);
    at(now, () => {
      real.setPlaying(true);
    });
    present();
    const midi = (type: "down" | "up") => {
      real.key({
        type,
        pitch: first.pitch,
        velocity: 90,
        timestamp: now,
        source: "midi",
        deviceId: "piano",
        channel: 1
      });
    };
    at(3000, () => {
      midi("down");
    });
    at(3001, () => {
      midi("up");
    });
    at(3002, () => {
      midi("down");
    });
    expect(interval.snapshot?.noteRole).toBe(1);
    select("hear-and-choose");
    real.configureCourse("reading", interval.policy);
    real.load(interval.exercise.song, READING_PRACTICE_OPTIONS, interval.exercise.id);
    at(3100, () => {
      midi("up");
    });
    select("see-and-play");
    real.configureCourse("reading", interval.policy);
    real.load(interval.exercise.song, READING_PRACTICE_OPTIONS, interval.exercise.id);
    at(now, () => {
      real.setPlaying(true);
    });
    present();
    at(5100, () => {
      midi("down");
    });
    at(5101, () => {
      midi("up");
    });
    at(5102, () => {
      midi("down");
    });
    expect(interval.snapshot?.noteRole).toBe(1);
    expect(interval.snapshot?.attempts).toHaveLength(1);
    at(5103, () => {
      real.destroy();
    });
  });
  it("keeps real Trainer and interval stage together when raw input precedes a new active frame", () => {
    select("see-and-play");
    if (!interval.exercise) throw new Error("Missing exercise");
    const view = { onTick: vi.fn(), setSong: vi.fn(), draw: vi.fn() };
    const real = new Trainer(view as unknown as FallingNotesView);
    real.configureCourse("reading", interval.policy);
    real.load(interval.exercise.song, READING_PRACTICE_OPTIONS, interval.exercise.id);
    at(now, () => {
      real.setPlaying(true);
    });
    present();
    const first = interval.exercise.song.notes[0];
    const second = interval.exercise.song.notes[1];
    if (!first || !second) throw new Error("Missing pair");
    const attack = (type: "down" | "up", timestamp: number) => {
      real.key({
        type,
        pitch: first.pitch,
        velocity: 90,
        timestamp,
        source: "midi",
        deviceId: "piano",
        channel: 1
      });
    };
    at(3000, () => {
      attack("down", 2999);
    });
    expect(real.nextDueNoteId()).toBe(first.id);
    expect(interval.snapshot?.attempts).toHaveLength(0);
    at(3001, () => {
      attack("up", 3001);
    });
    at(3002, () => {
      attack("down", 3002);
    });
    expect(real.nextDueNoteId()).toBe(second.id);
    expect(interval.snapshot?.noteRole).toBe(1);
    expect(interval.snapshot?.attempts).toHaveLength(1);
    at(3003, () => {
      attack("down", 3003);
    });
    expect(interval.snapshot?.attempts).toHaveLength(1);
    at(3004, () => {
      real.destroy();
    });
  });
  it("records help only after current visible acknowledgement and rejects stale help callbacks", () => {
    const practice = practiceForVisual();
    present();
    at(now + 10, interval.hint);
    expect(interval.helpShown).toBe(true);
    expect(interval.snapshot?.helpShown).toBe(false);
    const oldHelp = interval.onHelpPresented;
    expected(practice);
    nextVisual(practice);
    expected(practice);
    expect(interval.snapshot?.answers[0]?.unassistedSolved).toBe(true);
    expect(interval.snapshot?.answers[0]?.helpHistory).toEqual([]);
    at(now + 10, oldHelp);
    expect(interval.snapshot?.helpShown).toBe(false);
    nextVisual(practice);
    at(now + 10, interval.hint);
    at(now + 10, interval.onHelpPresented);
    expect(interval.snapshot?.helpShown).toBe(true);
    expected(practice);
    nextVisual(practice);
    expected(practice);
    expect(interval.snapshot?.answers[1]?.unassistedSolved).toBe(false);
    expect(interval.snapshot?.answers[1]?.helpHistory).toHaveLength(1);
  });
  it("requires confirmed staff and saves all 20 note attacks as 10 validated pair results", async () => {
    const p2 = store.getState().reading;
    const practice = practiceForVisual();
    expect(interval.exercise?.song.notes).toHaveLength(20);
    expect(interval.exercise?.pairs).toHaveLength(10);
    expect(accepts(practice)).toBe(false);
    present();
    expect(accepts(practice)).toBe(true);
    const run = interval.session?.identity()?.runId;
    const session = interval.session;
    for (let note = 0; note < 20; note++) {
      if (note > 0) nextVisual(practice);
      expect(
        new DOMParser()
          .parseFromString(interval.prompt?.musicXml ?? "", "application/xml")
          .querySelectorAll("note:not(:has(rest))")
      ).toHaveLength(2);
      expected(practice, note % 2 === 0 ? "midi" : "pointer");
      if (note === 4) {
        at(now, () => interval.setSourceFilter("pointer"));
        expect(interval.session).toBe(session);
        expect(interval.session?.identity()?.runId).toBe(run);
      }
    }
    expect(interval.snapshot?.completed).toBe(true);
    expect(interval.result?.questions).toHaveLength(10);
    expect(
      interval.result?.questions.every(
        (question) =>
          question.firstAttemptCorrect &&
          question.independentCorrect &&
          question.inputSource === "pointer"
      )
    ).toBe(true);
    expect(validIntervalResult(interval.result)).toBe(true);
    expect(store.getState().reading.intervals.history).toHaveLength(1);
    at(now, interval.publish);
    expect(store.getState().reading.intervals.history).toHaveLength(1);
    expect(store.getState().reading.history).toEqual(p2.history);
    expect(store.getState().reading.profile).toEqual(p2.profile);
    expect(store.getState().reading.preferences).toEqual(p2.preferences);
    await act(async () => {
      await store.flushReadingPersistence();
    });
    const saved = normalizeReadingState(await repository.load());
    expect(saved.invalid).toBe(false);
    expect(saved.reading.intervals.history).toEqual([interval.result]);
    expect(validIntervalResult(saved.reading.intervals.history[0])).toBe(true);
  });

  it("retains wrong anchors, wrong second notes and explicit whole-pair help", () => {
    const practice = practiceForVisual();
    present();
    const anchor = practice.nextDue()[0]?.pitch ?? 60;
    pitch(practice, anchor + 1, "pointer");
    expect(interval.snapshot?.questionIndex).toBe(0);
    expect(interval.snapshot?.noteRole).toBe(0);
    at(now + 20, interval.hint);
    expect(interval.snapshot?.helpShown).toBe(false);
    at(now + 1, interval.onHelpPresented);
    expected(practice, "keyboard");
    nextVisual(practice);
    const target = practice.nextDue()[0]?.pitch ?? 60;
    pitch(practice, target + 1, "midi");
    expected(practice, "pointer");
    const first = interval.snapshot?.answers[0];
    expect(first).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: false,
      inputSource: "pointer"
    });
    expect(first?.attempts.map((attempt) => attempt.inputSource)).toEqual([
      "pointer",
      "keyboard",
      "midi",
      "pointer"
    ]);
    expect(first?.helpHistory).toHaveLength(1);
    nextVisual(practice);
    expected(practice);
    nextVisual(practice);
    pitch(practice, (practice.nextDue()[0]?.pitch ?? 60) + 1);
    expected(practice);
    expect(interval.snapshot?.answers[1]).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: true
    });
  });

  it("blocks visual input when obscured, paused or hidden and ignores stale staff presentation", () => {
    const practice = practiceForVisual();
    present();
    render(true);
    expect(accepts(practice)).toBe(false);
    render(false);
    frame(practice, now + 100, false);
    expect(accepts(practice)).toBe(false);
    frame(practice, now + 100);
    expect(accepts(practice)).toBe(true);
    visibility("hidden");
    expect(accepts(practice)).toBe(false);
    visibility("visible");
    frame(practice, now + 100);
    const stale = interval.presentation;
    at(now, interval.newSeries);
    const replacement = interval.session;
    at(now + 100, () => stale?.onPresented(stale.id, now));
    expect(interval.session).toBe(replacement);
    expect(interval.snapshot?.presented).toBe(false);
  });
});

describe("interval course audio integration", () => {
  it("blocks choice before and during the full reference and saves typed keyboard/pointer choices without P2 changes", () => {
    const p2 = store.getState().reading;
    select("hear-and-choose");
    expect(setPlaying).toHaveBeenLastCalledWith(false);
    choose();
    expect(interval.snapshot?.attempts).toHaveLength(0);
    for (let question = 0; question < 10; question++) {
      listen();
      choose();
      expect(interval.snapshot?.questionIndex).toBe(question);
      expect(interval.snapshot?.attempts).toHaveLength(0);
      complete();
      choose(question % 2 === 0 ? "keyboard" : "pointer");
    }
    expect(validIntervalResult(interval.result)).toBe(true);
    expect(
      interval.result?.questions.every(
        (question) => question.firstListeningCorrect && question.responseKind === "category-choice"
      )
    ).toBe(true);
    expect(interval.result?.questions.map((question) => question.inputSource)).toEqual(
      Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? "keyboard" : "pointer"))
    );
    expect(store.getState().reading.history).toEqual(p2.history);
    expect(store.getState().reading.profile).toEqual(p2.profile);
    expect(store.getState().reading.intervals.history).toHaveLength(1);
  });

  it("preserves errors and distinguishes help, replay and first-listening success", () => {
    select("hear-and-choose");
    listen();
    complete();
    choose("pointer", true);
    expect(interval.snapshot?.questionIndex).toBe(0);
    expect(interval.snapshot?.errorCount).toBe(1);
    at(now + 50, interval.hint);
    at(now + 1, interval.onHelpPresented);
    choose("keyboard");
    expect(interval.snapshot?.answers[0]).toMatchObject({
      firstAttemptCorrect: false,
      independentCorrect: false,
      unassistedSolved: false,
      firstListeningCorrect: false
    });
    expect(interval.snapshot?.answers[0]?.helpHistory).toHaveLength(1);
    listen();
    complete();
    at(now + 1000, interval.audio.listen);
    complete(1500);
    at(now + 1900, () => undefined);
    choose();
    expect(interval.snapshot?.answers[1]).toMatchObject({
      fullListeningCount: 2,
      partialListeningCount: 0,
      independentCorrect: true,
      firstListeningCorrect: false,
      solutionMs: 3000
    });
  });

  it("requires replay after pause, hidden or blocked interruption and records only actually begun partial audio", () => {
    select("hear-and-choose");
    listen();
    const pending = owner();
    at(now + 10, interval.audio.togglePause);
    expect(interval.snapshot?.partialListeningCount).toBe(0);
    expect(pending.cancel).toHaveBeenCalled();
    at(now + 100, interval.audio.togglePause);
    choose();
    expect(interval.snapshot?.attempts).toHaveLength(0);
    const stale = listen();
    owner().started = true;
    visibility("hidden");
    expect(interval.snapshot?.partialListeningCount).toBe(1);
    visibility("visible");
    at(now + 50, stale.onCompleted);
    choose();
    expect(interval.snapshot?.fullListeningCount).toBe(0);
    expect(interval.snapshot?.attempts).toHaveLength(0);
    listen();
    complete();
    render(true);
    expect(interval.snapshot?.canAnswer).toBe(false);
    render(false);
    choose();
    expect(interval.snapshot?.attempts).toHaveLength(0);
    listen();
    complete();
    choose();
    expect(interval.snapshot?.answers[0]).toMatchObject({
      partialListeningCount: 1,
      fullListeningCount: 2,
      independentCorrect: true,
      firstListeningCorrect: false
    });
  });

  it("rejects stale callbacks after a new series and unmount and allows retry after readiness error", () => {
    select("hear-and-choose");
    const stale = listen();
    const old = owner();
    const oldSession = interval.session;
    at(now + 50, interval.newSeries);
    expect(old.disposed).toBe(true);
    expect(interval.session).not.toBe(oldSession);
    at(now + 100, stale.onCompleted);
    expect(interval.snapshot?.fullListeningCount).toBe(0);
    const failed = listen();
    owner().current = null;
    at(now + 100, () => {
      failed.onError(new Error("network"));
    });
    expect(interval.audio.error).toBe(true);
    expect(interval.snapshot?.canAnswer).toBe(false);
    const last = listen();
    expect(interval.audio.error).toBe(false);
    const session = interval.session;
    act(() => {
      root.unmount();
    });
    mounted = false;
    at(now + 2000, last.onCompleted);
    expect(session?.snapshot().fullListeningCount).toBe(0);
    expect(session?.snapshot().active).toBe(false);
  });
});

describe("exclusive course ownership", () => {
  it("switches P2 to P3 and back, and releases policy and audio on ordinary-song exit", () => {
    at(now, () => store.dispatch(readingActions.select({ task: "notes", seed: 1 })));
    const p2 = reading.session;
    expect(reading.exercise).not.toBeNull();
    expect(interval.exercise).toBeNull();
    select("hear-and-choose");
    expect(reading.exercise).toBeNull();
    expect(interval.exercise).not.toBeNull();
    expect(p2?.snapshot().active).toBe(false);
    listen();
    const preview = owner();
    at(now + 100, () => store.dispatch(readingActions.select({ task: "phrases", seed: 2 })));
    expect(preview.disposed).toBe(true);
    expect(interval.session).toBeNull();
    expect(reading.exercise?.task).toBe("phrases");
    select("hear-and-choose");
    listen();
    const exiting = owner();
    at(now + 100, () => {
      store.dispatch(
        songActions.songOpened({
          song: store.getState().song.sourceSong,
          lesson: null,
          librarySource: "ordinary.mid"
        })
      );
    });
    expect(store.getState().reading.activeCourse).toBeNull();
    expect(interval.session).toBeNull();
    expect(reading.session).toBeNull();
    expect(exiting.disposed).toBe(true);
    expect(configureCourse).toHaveBeenLastCalledWith("reading", null);
  });
});
