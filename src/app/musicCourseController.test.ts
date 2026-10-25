// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhrasePreviewRequest, PhrasePreviewReceipt } from "../audio/phrasePreview";
import type { Trainer } from "../practice/Trainer";
import { PracticeSession } from "../practice/session";
import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import { classifySightGroup } from "../musicLearning/sightReading";
import type { MusicResult, IntegratedProgress } from "../musicLearning/progress";
import { copyMusicResult } from "../musicLearning/progress";
import { musicFingerprint } from "../musicLearning/material";
import { generateSightReadingMaterial } from "../musicLearning/sightReading";
import { musicControllerChildView } from "./musicCourseControllerView";
import * as musicXml from "../song/musicxml";
import * as musicResults from "./musicCourseResults";
import {
  validateMusicEvidence,
  validateMusicInputJournal,
  musicNotesHaveJournal
} from "../musicLearning/evidenceValidation";
import { MusicCourseController } from "./musicCourseController";
import { emptyMusicState, copyMusicIntegrated } from "./musicPersistence";
import type { MusicPersistentState } from "./musicPersistence";
import type { MusicCourseCallbacks } from "./musicCourseContracts";
import { defaultTimingPreferences } from "./timingPreferences";

const audio = vi.hoisted(() => ({
  requests: [] as PhrasePreviewRequest[],
  start: vi.fn(() => Promise.resolve()),
  cancel: vi.fn()
}));
vi.mock("../audio/pianoSound", () => ({ startPianoSound: audio.start }));
vi.mock("../audio/phrasePreview", () => ({
  createPhrasePreview: () => ({
    play: (request: PhrasePreviewRequest) => {
      audio.requests.push(request);
      return Promise.resolve(true);
    },
    cancel: audio.cancel,
    dispose: vi.fn()
  })
}));
let now = 1000;
const controllers: MusicCourseController[] = [];
beforeEach(() => {
  now = 1000;
  audio.requests.length = 0;
  audio.start.mockReset().mockResolvedValue(undefined);
  audio.cancel.mockClear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.restoreAllMocks();
});
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

async function harness(
  patch: Partial<MusicPersistentState> = {},
  overrides: Partial<MusicCourseCallbacks> = {}
) {
  const saved = { ...emptyMusicState(), course: "sight-reading" as const, ...patch };
  const results: MusicResult[] = [];
  const progress: IntegratedProgress[] = [];
  const callbacks: MusicCourseCallbacks = {
    save: vi.fn<MusicCourseCallbacks["save"]>((result) => {
      results.push(result);
    }),
    saveIntegrated: vi.fn<MusicCourseCallbacks["saveIntegrated"]>((state) => {
      progress.push(state);
    }),
    rememberSeed: vi.fn(),
    known: () => Promise.resolve(new Set()),
    claim: vi.fn(() => Promise.resolve(true)),
    persistenceReady: () => Promise.resolve(),
    retry: vi.fn(),
    exit: vi.fn(),
    ...overrides
  };
  const controller = new MusicCourseController({ active: true, saved, revision: 1 }, callbacks);
  controllers.push(controller);
  let session: PracticeSession | null = null;
  let policy: TrainerMusicPolicy | null = null;
  let playing = false;
  const trainer = {
    setPlaying: vi.fn((next: boolean) => {
      if (!session || !policy) return;
      if (next) {
        session.resumeClock(now);
        playing = policy.onStart(session, now, []);
        if (!playing) session.pauseClock(now);
      } else {
        session.pauseClock(now);
        playing = false;
        policy.cancel(now);
      }
    })
  };
  const connection = {
    trainer: trainer as unknown as Trainer,
    blocked: false,
    deviceId: undefined,
    timing: defaultTimingPreferences()
  };
  controller.refreshConnection(connection);
  controller.activate();
  await flush();
  const attach = () => {
    const snapshot = controller.getSnapshot();
    if (!snapshot.scene) return;
    session = new PracticeSession(snapshot.scene.song, snapshot.options);
    session.startClock(now);
    session.pauseClock(now);
    policy = controller.policy(snapshot.scene.id);
    policy.seedHeld([], now);
    if (snapshot.staffVisible) controller.present(snapshot.scene.id, now);
  };
  const frame = (at: number) => {
    now = at;
    if (session && policy) {
      if (playing) session.tick(now);
      policy.onFrame(session, playing, now);
    }
  };
  const send = (type: "down" | "up", pitch: number, at: number) => {
    now = at;
    if (session && policy) {
      if (playing) session.tick(now);
      policy.onInput(
        { type, pitch, velocity: 80, timestamp: now, source: "keyboard", deviceId: "keyboard" },
        session,
        playing,
        { raw: now, corrected: now, received: now, admitted: true }
      );
      policy.onFrame(session, playing, now);
    }
  };
  const start = async () => {
    controller.command("start");
    await flush();
  };
  const prepareReading = () => {
    if (controller.getSnapshot().view.status === "preview")
      frame(now + saved.sightPreviewSeconds * 1000);
    let snapshot = controller.getSnapshot();
    if (snapshot.view.taskKind === "position" && snapshot.scene) {
      const required = snapshot.scene.notes
        .filter((note) => note.hand === "right" && note.startBeat < 4)
        .map((note) => note.pitch);
      const whites = Array.from({ length: 128 }, (_, pitch) => pitch).filter((pitch) =>
        [0, 2, 4, 5, 7, 9, 11].includes(pitch % 12)
      );
      const choice = snapshot.view.choices?.find((choice) => {
        const pitch = Number(choice.value.slice(9));
        const position = whites.slice(whites.indexOf(pitch), whites.indexOf(pitch) + 5);
        return required.every((note) => position.includes(note));
      });
      if (choice) controller.choose(choice.value, "keyboard");
    }
    snapshot = controller.getSnapshot();
    if (snapshot.view.taskKind === "group" && snapshot.scene)
      controller.choose(
        classifySightGroup(
          snapshot.scene.notes
            .filter((note) => note.hand === "right" && note.startBeat < 4)
            .map((note) => note.pitch)
        ),
        "keyboard"
      );
  };
  const playNotes = () => {
    const scene = controller.getSnapshot().scene;
    if (!scene || !session) throw new Error("Missing session");
    const began = now,
      lead = -session.time * 1000;
    const events = scene.notes
      .flatMap((note) => [
        {
          type: "down" as const,
          pitch: note.pitch,
          at: began + lead + (note.startBeat * 60_000) / scene.bpm
        },
        {
          type: "up" as const,
          pitch: note.pitch,
          at: began + lead + ((note.startBeat + note.durationBeats) * 60_000) / scene.bpm
        }
      ])
      .sort((a, b) => a.at - b.at || (a.type === "up" ? -1 : 1));
    for (const event of events) send(event.type, event.pitch, event.at);
    frame(now + 2000);
  };
  const playChords = () => {
    const scene = controller.getSnapshot().scene;
    if (!scene) throw new Error("Missing chord scene");
    const groups = [...new Set(scene.notes.map((note) => note.startBeat))];
    for (const group of groups) {
      const pitches = scene.notes
        .filter((note) => note.startBeat === group)
        .map((note) => note.pitch);
      const at = now + 10;
      for (const pitch of pitches) send("down", pitch, at);
      frame(at + 451);
      for (const pitch of pitches) send("up", pitch, at + 460);
      frame(at + 461);
    }
  };
  attach();
  return {
    controller,
    callbacks,
    results,
    progress,
    connection,
    trainer,
    attach,
    frame,
    send,
    start,
    prepareReading,
    playNotes,
    playChords,
    isPlaying: () => playing,
    session: () => session
  };
}
function receipt(request: PhrasePreviewRequest): PhrasePreviewReceipt {
  return {
    runId: request.runId,
    presentationId: request.presentationId,
    playbackId: request.playbackId,
    evidence: "engine-observed",
    firstAttackAudioSeconds: 1,
    observedAudioSeconds: 2,
    observedAttacks: request.material.notes.length,
    observedReleases: request.material.notes.length,
    totalNotes: request.material.notes.length
  };
}
function completeAudio() {
  const request = audio.requests.at(-1);
  if (!request) throw new Error("No audio request");
  now += 10;
  request.onStarted(receipt(request));
  now += 100;
  request.onCompleted(receipt(request));
}

describe("MusicCourseController", () => {
  it("waits for reservation and actual staff presentation before preview and manual start", async () => {
    let unlock: () => void = () => undefined;
    const h = await harness(
      {},
      {
        claim: () =>
          new Promise<boolean>((resolve) => {
            unlock = () => {
              resolve(true);
            };
          })
      }
    );
    expect(h.controller.getSnapshot().scene).toBeNull();
    unlock();
    await flush();
    expect(h.controller.getSnapshot().view.ready).toBe(false);
    h.attach();
    expect(h.controller.getSnapshot().view.status).toBe("preview");
    await h.start();
    expect(h.isPlaying()).toBe(false);
    const initial = h.session()?.time;
    h.frame(now + 3000);
    h.controller.refreshConnection({ ...h.connection, blocked: true });
    h.frame(now + 60_000);
    h.controller.refreshConnection(h.connection);
    expect(h.controller.getSnapshot().view.previewSeconds).toBe(7);
    expect(h.session()?.time).toBe(initial);
    h.frame(now + 7000);
    expect(h.controller.getSnapshot().staffVisible).toBe(false);
    h.prepareReading();
    await h.start();
    expect(h.isPlaying()).toBe(true);
    expect(h.controller.getSnapshot().staffVisible).toBe(true);
  });
  it("performs training position/group tasks and saves actual WAIT notes without rhythm claims", async () => {
    const h = await harness({ sightLevel: "steps" });
    h.prepareReading();
    expect(h.controller.getSnapshot().view.canStart).toBe(true);
    await h.start();
    h.playNotes();
    expect(h.results).toHaveLength(1);
    const result = h.results[0];
    expect(result?.course).toBe("sight-reading");
    if (result?.course === "sight-reading") {
      expect(result.playedNotes).not.toHaveLength(0);
      expect(result.metrics.onsetErrors).toBeNull();
      expect(result.groupAnswers).toHaveLength(1);
    }
    h.frame(now + 1000);
    h.controller.command("finish");
    expect(h.results).toHaveLength(1);
  });
  it.each(["steps", "triads", "two-hands"] as const)(
    "stops control %s before asking and keeps the first wrong group choice",
    async (sightLevel) => {
      const h = await harness({ purpose: "control", sightLevel });
      h.prepareReading();
      const before = h.controller.getSnapshot();
      expect(before.view.taskKind).toBe("sight-reading");
      expect(
        before.view.choices?.some((choice) =>
          ["scalar", "triadic", "repeated", "mixed"].includes(choice.value)
        )
      ).toBe(false);
      expect(before.fingeringVisible).toBe(false);
      await h.start();
      h.playNotes();
      expect(h.results).toHaveLength(0);
      const question = h.controller.getSnapshot();
      expect(question.view.taskKind).toBe("group");
      expect(question.view.canAnswer).toBe(true);
      expect(question.view.canStart).toBe(false);
      expect(question.view.canFinish).toBe(false);
      expect(question.view.showHelp).toBe(false);
      expect(question.keysVisible).toBe(false);
      expect(question.staffXml).not.toContain("<fingering>");
      expect(h.isPlaying()).toBe(false);
      const stoppedTime = h.session()?.time;
      h.frame(now + 5000);
      expect(h.session()?.time).toBe(stoppedTime);
      h.controller.command("start");
      await flush();
      expect(h.isPlaying()).toBe(false);
      const scene = question.scene;
      if (!scene) throw new Error("Missing reading scene");
      expect(
        h.controller
          .policy(scene.id)
          .guidance(new PracticeSession(scene.song, question.options), false).lights
      ).toEqual([]);
      const expected = sightLevel === "steps" ? "scalar" : "triadic";
      const answer = expected === "scalar" ? "triadic" : "scalar";
      const answeredAt = now;
      h.controller.choose(answer, "pointer");
      expect(h.results).toHaveLength(1);
      const result = h.results[0];
      if (result?.course !== "sight-reading") throw new Error("Missing reading result");
      expect(result.groupAnswers).toEqual([{ expected, answer }]);
      expect(result.metrics.groupErrors).toBe(1);
      expect(result.inputJournal?.events.at(-1)).toMatchObject({
        kind: "choice",
        value: answer,
        eligible: true,
        source: "pointer",
        rawAtMs: answeredAt,
        correctedAtMs: answeredAt,
        receivedAtMs: answeredAt,
        runId: result.runId
      });
      expect(typeof result.inputJournal?.events.at(-1)?.id).toBe("string");
      expect(validateMusicInputJournal(result.inputJournal)).toBe(true);
      h.controller.choose(expected, "keyboard");
      expect(h.results).toHaveLength(1);
      expect(result.groupAnswers).toEqual([{ expected, answer }]);
    }
  );
  it("leaves group recognition unmeasured when note control contains no group question", async () => {
    const h = await harness({ purpose: "control", sightLevel: "notes" });
    h.prepareReading();
    await h.start();
    h.playNotes();
    const result = h.results[0];
    if (result?.course !== "sight-reading") throw new Error("Missing reading result");
    expect(result.groupAnswers).toEqual([]);
    expect(result.metrics.groupErrors).toBeNull();
    expect(h.controller.getSnapshot().view.result?.metrics).toContainEqual({
      labelKey: "Ошибки распознавания групп",
      value: null
    });
  });
  it("reserves a different unparsed control candidate after a journal collision", async () => {
    const first = musicFingerprint(
      generateSightReadingMaterial({ seed: 1, level: "notes", purpose: "control" }).notes
    );
    const h = await harness(
      { purpose: "control" },
      { known: () => Promise.resolve(new Set([first])) }
    );
    expect(h.controller.getSnapshot().scene?.fingerprint).not.toBe(first);
    expect(h.callbacks.rememberSeed).toHaveBeenCalled();
    h.prepareReading();
    expect(h.controller.getSnapshot().view.showHelp).toBe(false);
    expect(h.controller.getSnapshot().options.mode).toBe("tempo");
    const scene = h.controller.getSnapshot().scene;
    if (scene)
      expect(
        h.controller
          .policy(scene.id)
          .guidance(new PracticeSession(scene.song, h.controller.getSnapshot().options), false)
          .lights
      ).toEqual([]);
  });
  it("marks a fourth physical note as an error instead of auto-completing C major", async () => {
    const h = await harness({ course: "harmony", harmonyLesson: "triads" });
    await h.start();
    h.send("down", 60, now + 10);
    h.send("down", 64, now + 10);
    h.send("down", 67, now + 10);
    h.send("down", 65, now + 10);
    h.frame(now + 500);
    expect(h.results).toEqual([]);
    expect(h.controller.getSnapshot().view.status).not.toBe("result");
  });
  it("does not block start with another input source's preheld keys", async () => {
    const h = await harness({ course: "harmony", harmonyLesson: "triads" });
    const snapshot = h.controller.getSnapshot(),
      session = h.session();
    if (!snapshot.scene || !session) throw new Error("No chord session");
    session.resumeClock(now);
    expect(
      h.controller.policy(snapshot.scene.id).onStart(session, now, [
        {
          type: "down",
          pitch: 60,
          velocity: 80,
          timestamp: now,
          source: "midi",
          deviceId: "foreign",
          channel: 1
        }
      ])
    ).toBe(true);
  });
  it("uses nonstaff readiness, full audio receipts, two control plays and explicit dictation finish", async () => {
    const h = await harness({ course: "dictation", purpose: "control" });
    expect(h.controller.getSnapshot().staffVisible).toBe(false);
    expect(h.controller.getSnapshot().view.canListen).toBe(true);
    await h.start();
    expect(h.isPlaying()).toBe(false);
    h.controller.command("listen");
    expect(h.controller.getSnapshot().view.status).toBe("listening");
    const first = audio.requests.at(-1);
    if (!first) throw new Error("No reference");
    now += 10;
    first.onStarted(receipt(first));
    now += 10;
    first.onCancelled({ ...receipt(first), partial: true });
    expect(h.controller.getSnapshot().view.canStart).toBe(false);
    h.controller.command("listen");
    completeAudio();
    expect(h.controller.getSnapshot().view.canListen).toBe(false);
    expect(h.controller.getSnapshot().view.canStart).toBe(true);
    h.controller.command("listen");
    expect(audio.requests).toHaveLength(2);
    await h.start();
    h.playNotes();
    expect(h.results).toHaveLength(0);
    h.controller.command("finish");
    expect(h.results).toHaveLength(1);
    expect(h.results[0]?.course).toBe("dictation");
    const review = h.controller.getSnapshot();
    expect(review.staffVisible).toBe(true);
    expect(review.view.result?.notes?.expectedNotes).toHaveLength(2);
    expect(review.view.result?.notes?.playedNotes).toHaveLength(2);
    if (!review.scene) throw new Error("Missing review score");
    h.controller.present(review.scene.id, now + 1000);
    expect(h.controller.getSnapshot().view.status).toBe("result");
  });
  it("keeps partial-audio and old callbacks from opening another presentation", async () => {
    const h = await harness({ course: "dictation" });
    h.controller.command("listen");
    const old = audio.requests.at(-1);
    if (!old) throw new Error("No audio");
    h.controller.dispose();
    h.controller.activate();
    await flush();
    h.attach();
    old.onStarted(receipt(old));
    old.onCompleted(receipt(old));
    expect(h.controller.getSnapshot().view.canStart).toBe(false);
  });
  it("pauses a menu without clearing notes but invalidates a device/timing change", async () => {
    const h = await harness();
    h.prepareReading();
    await h.start();
    const session = h.session();
    if (!session) throw new Error("No session");
    h.send("down", 60, now + 4000);
    h.send("up", 60, now + 100);
    h.controller.refreshConnection({ ...h.connection, blocked: true });
    expect(h.controller.getSnapshot().view.status).toBe("paused");
    h.controller.refreshConnection(h.connection);
    expect(h.controller.getSnapshot().view.status).toBe("paused");
    h.controller.refreshConnection({
      ...h.connection,
      timing: { ...h.connection.timing, manualOffsetMs: 10 }
    });
    expect(h.controller.getSnapshot().view.status).toBe("error");
    expect(h.results).toEqual([]);
  });
  it("executes all P8 children with manual next and persists skill evidence without P5/P7 duplicates", async () => {
    const createChild = musicResults.createMusicIntegratedChild;
    vi.spyOn(musicResults, "createMusicIntegratedChild").mockImplementation((context, snapshot) => {
      const child = createChild(context, snapshot);
      if (!child.evidence) throw new Error("Missing native child body");
      expect(
        validateMusicInputJournal(child.evidence.inputJournal),
        JSON.stringify(child.evidence.inputJournal)
      ).toBe(true);
      expect(
        musicNotesHaveJournal(child.evidence.notes, child.evidence.inputJournal),
        JSON.stringify(child.evidence)
      ).toBe(true);
      expect(validateMusicEvidence(child.evidence), JSON.stringify(child.evidence)).toBe(true);
      if ("groups" in child.errors && child.errors.groups === 0) {
        const measured = child.evidence.inputJournal.events.some(
          (event) =>
            event.kind === "choice" &&
            event.eligible &&
            ["scalar", "triadic", "repeated", "mixed"].includes(event.value)
        );
        expect(musicControllerChildView(child, true, false).metrics).toContainEqual({
          labelKey: "Ошибки распознавания групп",
          value: measured ? 0 : null
        });
      }
      return child;
    });
    const h = await harness({ course: "integrated" });
    let guard = 0;
    while (h.controller.getSnapshot().view.status !== "completed" && guard++ < 35) {
      let snapshot = h.controller.getSnapshot();
      if (snapshot.view.status === "result") {
        expect(snapshot.view.canNext).toBe(true);
        h.controller.command("next");
        await flush();
        h.attach();
      }
      h.prepareReading();
      snapshot = h.controller.getSnapshot();
      if (!snapshot.staffVisible && snapshot.view.canListen) {
        h.controller.command("listen");
        completeAudio();
      }
      await h.start();
      expect(h.isPlaying()).toBe(true);
      if (snapshot.view.taskKind === "auditory-interval") {
        const pitches = snapshot.scene?.notes.map((note) => note.pitch) ?? [];
        h.playNotes();
        expect(h.controller.getSnapshot().view.canFinish).toBe(false);
        h.controller.command("finish");
        expect(h.controller.getSnapshot().view.status).not.toBe("result");
        h.controller.choose((pitches[1] ?? 0) - (pitches[0] ?? 0) === 4 ? "3" : "5", "keyboard");
        h.frame(now + 1);
        continue;
      }
      if (["build-chord", "invert-chord", "voice-leading"].includes(snapshot.view.taskKind))
        h.playChords();
      else h.playNotes();
      if (
        h.controller.getSnapshot().view.status !== "result" &&
        h.controller.getSnapshot().view.status !== "completed"
      )
        h.controller.command("finish");
      if (h.controller.getSnapshot().view.taskKind === "group") {
        expect(h.isPlaying()).toBe(false);
        expect(h.controller.getSnapshot().view.canStart).toBe(false);
        h.controller.choose("triadic", "pointer");
      }
    }
    expect(guard).toBeLessThan(35);
    expect(h.controller.getSnapshot().view.status).toBe("completed");
    expect(h.progress.at(-1)?.state.completedPhases).toHaveLength(7);
    expect(h.results).toHaveLength(1);
    expect(h.results[0]?.course).toBe("integrated");
    const finalView = h.controller.getSnapshot().view;
    expect(finalView.phaseKey).toBe("Музыкальный урок завершён");
    expect(finalView.result?.metrics).toEqual([
      { labelKey: "Завершено этапов", value: 7 },
      { labelKey: "Выполнено заданий", value: 16 }
    ]);
    const completedSave = h.progress.at(-1);
    const aggregate = h.results[0];
    if (!completedSave || aggregate?.course !== "integrated")
      throw new Error("Missing completed lesson");
    for (const history of [[copyMusicResult(aggregate)], []]) {
      const resumed = await harness({
        course: "integrated",
        integrated: copyMusicIntegrated(completedSave),
        history
      });
      const view = resumed.controller.getSnapshot().view;
      expect(view.status).toBe("completed");
      expect(view.phaseKey).toBe("Музыкальный урок завершён");
      expect(view.result?.metrics).toEqual(finalView.result?.metrics);
      if (history.length)
        expect(view.result).toEqual(musicResults.createMusicResultView(aggregate));
      expect(view.canNext).toBe(false);
      resumed.controller.command("next");
      expect(resumed.controller.getSnapshot().view.counter?.current).toBe(7);
      expect(resumed.results).toEqual([]);
      expect(resumed.progress).toEqual([]);
    }
    const completed = h.progress.at(-1)?.state.completedPhases;
    expect(h.controller.getSnapshot().view.canAnswer).toBe(true);
    h.controller.choose("repeat-phase:read-melody", "keyboard");
    await flush();
    h.attach();
    expect(h.progress.at(-1)?.state.completedPhases).toEqual(completed);
    expect(h.controller.getSnapshot().view.counter?.current).toBe(2);
    expect(h.isPlaying()).toBe(false);
  });
  it("keeps a live old run input-capable when all 4096 replacement candidates are known", async () => {
    let exhausted = false;
    const known = new Set<string>();
    for (let seed = 2; seed <= 4097; seed++)
      known.add(
        musicFingerprint(
          generateSightReadingMaterial({ seed, level: "notes", purpose: "control" }).notes
        )
      );
    const h = await harness(
      { purpose: "control" },
      { known: () => Promise.resolve(exhausted ? known : new Set()) }
    );
    h.prepareReading();
    await h.start();
    const previous = h.controller.getSnapshot();
    const session = h.session();
    exhausted = true;
    h.controller.command("retry");
    await flush();
    expect(h.controller.getSnapshot().scene).toBe(previous.scene);
    expect(h.controller.getSnapshot().options).toBe(previous.options);
    expect(h.controller.getSnapshot().view.status).toBe("playing");
    expect(h.isPlaying()).toBe(true);
    expect(h.session()).toBe(session);
    const first = previous.scene?.notes[0];
    if (!first) throw new Error("Missing old music");
    h.send("down", first.pitch, now + 4000);
    h.send("up", first.pitch, now + 100);
    h.controller.command("finish");
    expect(h.results).toHaveLength(1);
    expect(h.callbacks.retry).not.toHaveBeenCalled();
  });
  it("publishes the next score groups at a frame boundary before the next physical attack", async () => {
    const h = await harness({ sightLevel: "steps" });
    h.prepareReading();
    await h.start();
    const snapshot = h.controller.getSnapshot(),
      session = h.session();
    if (!snapshot.scene || !session) throw new Error("No reading session");
    const began = now,
      lead = -session.time * 1000,
      beatMs = 60_000 / snapshot.scene.bpm;
    const first = snapshot.scene.notes.filter((note) => note.startBeat < 4);
    const events = first
      .flatMap((note) => [
        { type: "down" as const, pitch: note.pitch, at: began + lead + note.startBeat * beatMs },
        {
          type: "up" as const,
          pitch: note.pitch,
          at: began + lead + (note.startBeat + note.durationBeats) * beatMs
        }
      ])
      .sort((a, b) => a.at - b.at || (a.type === "up" ? -1 : 1));
    for (const event of events)
      if (event.at < began + lead + 4 * beatMs) h.send(event.type, event.pitch, event.at);
    const before = h.controller.getSnapshot().staffXml;
    h.frame(began + lead + 4 * beatMs + 1);
    expect(h.controller.getSnapshot().staffXml).not.toBe(before);
    expect(h.controller.getSnapshot().view.status).toBe("playing");
  });
  it("reserves latest preferences before replacing the live policy and applies them only on success", async () => {
    const latest = {
      ...emptyMusicState(),
      course: "sight-reading" as const,
      purpose: "control" as const,
      sightLevel: "triads" as const,
      sightPreviewSeconds: 5
    };
    const h = await harness({}, { readSelection: () => latest });
    h.prepareReading();
    await h.start();
    const previous = h.controller.getSnapshot();
    h.controller.command("retry");
    await flush();
    expect(h.controller.getSnapshot().scene?.id).not.toBe(previous.scene?.id);
    expect(h.controller.getSnapshot().options.mode).toBe("tempo");
    expect(h.callbacks.rememberSeed).toHaveBeenLastCalledWith(
      h.controller.getSnapshot().scene?.seed
    );
    expect(h.callbacks.retry).not.toHaveBeenCalled();
    h.attach();
    h.frame(now + 5000);
    expect(h.controller.getSnapshot().view.status).toBe("ready");
    expect(h.controller.getSnapshot().view.taskKind).toBe("sight-reading");
  });
  it("lets a visual alternative start and finish when audio initialization fails", async () => {
    const h = await harness({ course: "dictation" });
    h.controller.choose("visual-alternative", "pointer");
    h.attach();
    expect(h.controller.getSnapshot().staffVisible).toBe(true);
    expect(h.controller.getSnapshot().view.instructionKey).toBe(
      "Посмотрите фразу на стане и повторите её на клавишах. Слух в этом задании не оценивается."
    );
    audio.start.mockRejectedValue(new Error("audio unavailable"));
    await h.start();
    expect(h.isPlaying()).toBe(true);
    expect(audio.start).not.toHaveBeenCalled();
    h.playNotes();
    expect(h.controller.getSnapshot().view.status).toBe("result");
    expect(h.results).toEqual([]);
    expect(h.controller.getSnapshot().view.result?.summaryKey).toBe(
      "Зрительная тренировка завершена. Слуховой навык не оценивался."
    );
  });
  it("keeps visual reading available after sound failure without claiming auditory evidence", async () => {
    const h = await harness();
    h.prepareReading();
    audio.start.mockRejectedValue(new Error("no sound"));
    await h.start();
    expect(h.isPlaying()).toBe(true);
    h.playNotes();
    expect(h.results[0]?.course).toBe("sight-reading");
  });
  it("resumes a completed P8 child boundary without replaying it or writing duplicate history", async () => {
    const h = await harness({ course: "integrated" });
    await h.start();
    h.playNotes();
    const saved = h.progress.at(-1);
    if (!saved) throw new Error("No saved P8 progress");
    const resumed = await harness({ course: "integrated", integrated: copyMusicIntegrated(saved) });
    expect(resumed.controller.getSnapshot().view.status).toBe("result");
    expect(resumed.controller.getSnapshot().view.result).toEqual({
      ...h.controller.getSnapshot().view.result,
      newMaterial: false
    });
    expect(resumed.progress).toEqual([]);
    expect(resumed.results).toEqual([]);
    resumed.controller.command("next");
    await flush();
    resumed.attach();
    expect(resumed.controller.getSnapshot().scene?.notes[0]?.pitch).toBe(62);
    expect(resumed.progress.at(-1)?.state.results).toHaveLength(1);
  });
  it("recommends a weak skill after three source-specific observations and limits repeat loops", async () => {
    const h = await harness({ course: "integrated" });
    for (let index = 0; index < 3; index++) {
      await h.start();
      h.send("down", 90, now + 100);
      h.send("up", 90, now + 10);
      h.playNotes();
      const recommendation = h.controller
        .getSnapshot()
        .view.choices?.find((choice) => choice.labelKey === "Рекомендуем повторить: {skill}");
      if (index < 2) expect(recommendation).toBeUndefined();
      else
        expect(recommendation).toMatchObject({
          value: "repeat-phase:find-keys",
          params: { skill: "Поиск клавиш" }
        });
      if (index < 2) {
        h.controller.command("next");
        await flush();
        h.attach();
      }
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      h.controller.choose("repeat-phase:find-keys", "keyboard");
      await flush();
      h.attach();
      expect(h.isPlaying()).toBe(false);
      await h.start();
      h.send("down", 90, now + 100);
      h.send("up", 90, now + 10);
      h.playNotes();
    }
    expect(
      h.controller
        .getSnapshot()
        .view.choices?.some((choice) => choice.labelKey === "Рекомендуем повторить: {skill}")
    ).toBe(false);
  });
  it("shows cached solver fingering only after explicit training help and records that help", async () => {
    const annotate = vi.spyOn(musicXml, "musicXmlWithFingering");
    const h = await harness({ sightLevel: "steps" });
    expect(h.controller.getSnapshot().fingeringVisible).toBe(false);
    expect(h.controller.getSnapshot().staffXml).not.toContain("<fingering>");
    h.controller.command("hint");
    expect(h.controller.getSnapshot().fingeringVisible).toBe(true);
    expect(h.controller.getSnapshot().staffXml).toMatch(/<fingering>[1-5]<\/fingering>/);
    expect(annotate).toHaveBeenCalledTimes(1);
    h.frame(now + 1000);
    expect(annotate).toHaveBeenCalledTimes(1);
    h.prepareReading();
    await h.start();
    h.playNotes();
    expect(h.results[0]?.help.some((event) => event.kind === "fingering")).toBe(true);
    const control = await harness({ purpose: "control" });
    control.controller.command("hint");
    expect(control.controller.getSnapshot().fingeringVisible).toBe(false);
    expect(control.controller.getSnapshot().staffXml).not.toContain("<fingering>");
  });
  it("discloses only the known starting anchor while keeping relative dictation unknown", async () => {
    const known = await harness({ course: "dictation", dictationStartMode: "known" });
    expect(known.controller.getSnapshot().view.startPitch).toBe(
      known.controller.getSnapshot().scene?.notes[0]?.pitch
    );
    const relative = await harness({ course: "dictation", dictationStartMode: "relative" });
    expect(relative.controller.getSnapshot().view.startPitch).toBeUndefined();
  });
});
