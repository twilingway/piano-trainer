import type { LessonStaffFeedbackReceipt } from "../staff/lessonStaffFeedback";
import { MusicStaffFeedback } from "./musicStaffFeedback";
import type { KeyEvent } from "../input/midiInput";
import { DictationSession } from "../musicLearning/dictationSession";
import type { DictationResult } from "../musicLearning/dictationSession";
import {
  createDictationListening,
  reduceDictationListening,
  summarizeDictationListening
} from "../musicLearning/dictationListening";
import type {
  DictationListeningEvent,
  DictationListeningState
} from "../musicLearning/dictationListening";
import { HarmonyChordInput } from "../musicLearning/harmonyInput";
import type { HarmonyInputFailure } from "../musicLearning/harmonyInput";
import { MusicPerformanceCapture } from "../musicLearning/performanceCapture";
import type { HarmonyAnswer } from "../musicLearning/progress";
import { HARMONY_ONSET_WINDOW_MS } from "../musicLearning/progress";
import { TWO_HAND_WINDOW_MS, TWO_HAND_HORIZON_MS } from "../reading/twoHandTypes";
import type { MusicHelpEvent, MusicNote } from "../musicLearning/types";
import type { MusicInputTimes } from "../practice/musicPolicy";
import type { PracticeEvent, PracticeSession } from "../practice/session";
import type { MusicActivity } from "./musicCourseExercise";
import type { MusicPersistentState } from "./musicPersistence";
import { MusicRunRecorder, validMusicRunKey } from "./musicCourseRunEvidence";
import type { MusicRunInputContext, MusicRunInputOutcome } from "./musicCourseRunEvidence";
import type { MusicInputJournalData, MusicPresentationKind } from "../musicLearning/evidence";

export interface MusicRunIdentity {
  readonly runId: string;
  readonly presentationId: string;
}
export interface MusicRunEvidence {
  readonly notes: readonly MusicNote[];
  readonly answers: readonly HarmonyAnswer[];
  readonly dictation: DictationResult | null;
  readonly help: readonly MusicHelpEvent[];
  readonly listening: DictationListeningState;
  readonly inputJournal?: MusicInputJournalData;
}

/** Thin input wiring: every musical position is read from the lent PracticeSession. */
export class MusicCourseRun {
  private readonly capture: MusicPerformanceCapture;
  private readonly harmony = new HarmonyChordInput();
  private readonly dictation: DictationSession | null;
  private hearing: DictationListeningState;
  private readonly held = new Map<string, KeyEvent>();
  private started = false;
  private finished = false;
  private correctChoice = false;
  private choiceMade = false;
  private chordIndex = 0;
  private chordPresented = false;
  private answers: HarmonyAnswer[] = [];
  private help: MusicHelpEvent[] = [];
  private completed: MusicRunEvidence | null = null;
  private paused = false;
  private failedPitches: readonly number[] = [];
  private readonly recorder: MusicRunRecorder;
  private ready = false;
  private cancelled = false;
  private readonly staffFeedback: MusicStaffFeedback;

  constructor(
    readonly activity: MusicActivity,
    readonly selection: MusicPersistentState,
    readonly identity: MusicRunIdentity,
    readonly deviceId: string | undefined,
    feedback?: (receipt: LessonStaffFeedbackReceipt) => void
  ) {
    this.staffFeedback = new MusicStaffFeedback(activity, identity, feedback);
    this.recorder = new MusicRunRecorder(identity, activity.exercise.notes);
    const input = {
      source: selection.inputSource,
      ...(selection.inputSource === "midi" && deviceId ? { deviceId } : {})
    };
    this.capture = new MusicPerformanceCapture({ presentationId: identity.presentationId, input });
    this.dictation = activity.dictation
      ? new DictationSession({
          exercise: activity.dictation,
          attemptId: identity.runId,
          presentationId: identity.presentationId,
          purpose: activity.purpose,
          input
        })
      : null;
    this.hearing = createDictationListening(
      identity.runId,
      identity.presentationId,
      activity.purpose
    );
  }

  private owner(event: KeyEvent): string {
    return JSON.stringify([
      event.source ?? "pointer",
      event.deviceId ?? "",
      event.channel ?? 0,
      event.pitch
    ]);
  }
  private admits(event: KeyEvent): boolean {
    return (
      event.source === this.selection.inputSource &&
      (event.source !== "midi" || !this.deviceId || event.deviceId === this.deviceId)
    );
  }
  seed(events: readonly KeyEvent[], atMs: number, offsetMs = 0): void {
    if (this.started) return;
    const selected = events.filter(
      (event) =>
        this.admits(event) &&
        validMusicRunKey(event) &&
        (event.timestamp === undefined ||
          (Number.isFinite(event.timestamp) && event.timestamp >= 0 && event.timestamp <= atMs))
    );
    this.recorder.seed(selected, atMs, offsetMs);
    this.held.clear();
    for (const event of selected) this.held.set(this.owner(event), event);
    this.capture.seedHeld(selected, atMs);
    for (const event of selected)
      this.dictation?.receiveInput({
        presentationId: this.identity.presentationId,
        kind: "down",
        pitch: event.pitch,
        correctedAtMs: atMs,
        songBeat: 0,
        source: event.source ?? "pointer",
        ...(event.deviceId ? { deviceId: event.deviceId } : {}),
        ...(event.channel === undefined ? {} : { channel: event.channel })
      });
    this.harmony.seedHeld(
      selected.flatMap((event) =>
        event.source
          ? [
              {
                source: event.source,
                pitch: event.pitch,
                atMs,
                correctedAtMs: atMs,
                ...(event.deviceId ? { deviceId: event.deviceId } : {}),
                ...(event.channel === undefined ? {} : { channel: event.channel })
              }
            ]
          : []
      )
    );
  }
  setReady(ready: boolean, atMs: number): void {
    if (Number.isFinite(atMs) && atMs >= 0) this.ready = ready;
    this.capture.setReady(ready, atMs);
    this.dictation?.setReady(ready, atMs);
  }
  pause(paused: boolean, atMs: number): void {
    this.paused = paused;
    this.capture.setPaused(paused, atMs);
    this.dictation?.setPaused(paused, atMs);
    if (paused && this.activity.chords && !this.finished) {
      this.chordPresented = false;
      this.harmony.seedHeld(
        [...this.held.values()].flatMap((event) =>
          event.source
            ? [
                {
                  source: event.source,
                  pitch: event.pitch,
                  atMs,
                  correctedAtMs: atMs,
                  ...(event.deviceId ? { deviceId: event.deviceId } : {}),
                  ...(event.channel === undefined ? {} : { channel: event.channel })
                }
              ]
            : []
        )
      );
    }
  }
  start(session: PracticeSession, atMs: number, offsetMs: number): boolean {
    this.recorder.observe(session, atMs);
    if (
      !this.recorder.valid ||
      this.cancelled ||
      this.finished ||
      this.held.size ||
      (this.activity.auditory && !this.listeningSummary().canReply)
    )
      return false;
    this.setReady(true, Math.max(0, atMs - offsetMs));
    this.pause(false, Math.max(0, atMs - offsetMs));
    if (!this.started && this.dictation && !this.dictation.openReply(Math.max(0, atMs - offsetMs)))
      return false;
    this.started = true;
    this.presented(atMs, "ready");
    this.presentChord(atMs, offsetMs);
    return true;
  }
  private presentChord(atMs: number, offsetMs: number): void {
    const step = this.activity.chords?.[this.chordIndex];
    if (!step || this.chordPresented) return;
    this.harmony.present({
      id: `${this.identity.presentationId}:chord:${String(this.chordIndex)}`,
      atMs,
      correctedAtMs: Math.max(0, atMs - offsetMs),
      target: step.target,
      retainCommonPitches: step.carry
    });
    this.chordPresented = true;
  }
  receiveListening(event: DictationListeningEvent): boolean {
    this.recorder.observe(null, event.atMs);
    if (this.dictation) return this.dictation.receiveListening(event);
    const next = reduceDictationListening(this.hearing, event);
    if (next === this.hearing) return false;
    this.hearing = next;
    return true;
  }
  listeningSummary() {
    return summarizeDictationListening(this.dictation?.snapshot().listening ?? this.hearing);
  }
  addHelp(event: MusicHelpEvent): void {
    if (this.activity.purpose !== "training") return;
    this.help.push({ ...event });
    this.dictation?.addHelp(event);
  }
  presented(atMs: number, kind: MusicPresentationKind): void {
    this.recorder.present(atMs, kind);
  }
  recordChoice(value: string, source: "keyboard" | "pointer", atMs: number): boolean {
    return this.recorder.choice(
      value,
      source,
      atMs,
      this.ready && !this.paused && !this.completed && !this.cancelled
    );
  }
  choose(value: string, source: "keyboard" | "pointer" = "keyboard", atMs?: number): boolean {
    const eligible =
      !this.finished &&
      !this.cancelled &&
      this.started &&
      this.activity.expectedChoice !== undefined;
    if (!this.recorder.choice(value, source, atMs, eligible) || !eligible) return false;
    this.choiceMade = true;
    this.correctChoice = value === this.activity.expectedChoice;
    this.answers.push({ kind: "named", expected: this.activity.expectedChoice, answer: value });
    if (this.activity.integrated?.kind !== "interval") this.finished = true;
    return true;
  }
  input(
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    times: MusicInputTimes
  ): readonly PracticeEvent[] {
    if (this.completed || !this.admits(event)) return [];
    const events = this.recorder.input(event, session, times, (context) =>
      this.receiveInput(event, session, playing, times, context)
    );
    if (!this.recorder.valid) this.cancel(times.received);
    else this.staffFeedback.input(events);
    return events;
  }
  private receiveInput(
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    times: MusicInputTimes,
    { fresh, hand, songBeat }: MusicRunInputContext
  ): MusicRunInputOutcome {
    if (
      ![times.raw, times.corrected, times.received].every(
        (value) => Number.isFinite(value) && value >= 0
      ) ||
      times.received < times.raw ||
      times.received - times.raw > 250 ||
      !Number.isFinite(event.velocity)
    ) {
      if (event.type === "up" && this.admits(event)) this.cancel(times.received);
      return { events: [], eligible: false };
    }
    const allowed = this.admits(event);
    if (
      allowed &&
      Number.isFinite(times.raw) &&
      times.received >= times.raw &&
      times.received - times.raw <= 250
    ) {
      const owner = this.owner(event);
      if (fresh && event.type === "down") this.held.set(owner, { ...event, timestamp: times.raw });
      else if (fresh) this.held.delete(owner);
    }
    if (this.dictation) {
      let eligible = false;
      this.dictation.setPaused(this.paused || !playing || !times.admitted, times.corrected);
      const capturedBeat = songBeat ?? (!this.started ? 0 : undefined);
      if (capturedBeat !== undefined && capturedBeat >= 0)
        eligible = this.dictation.receiveInput({
          presentationId: this.identity.presentationId,
          kind: event.type,
          pitch: event.pitch,
          correctedAtMs: times.corrected,
          songBeat: capturedBeat,
          source: event.source ?? "pointer",
          ...(event.deviceId ? { deviceId: event.deviceId } : {}),
          ...(event.channel === undefined ? {} : { channel: event.channel })
        });
      else if (event.type === "up" && allowed) this.dictation.cancel(times.received);
      return { events: [], eligible };
    }
    if (this.activity.chords) {
      const eligible =
        fresh &&
        allowed &&
        playing &&
        times.admitted &&
        this.started &&
        !this.paused &&
        !this.finished &&
        this.chordPresented;
      if (allowed && playing && times.admitted && this.started && !this.paused && !this.finished) {
        const chord = this.harmony.input(event, {
          correctedAtMs: times.corrected,
          receivedAtMs: times.received
        });
        if (chord.reason && chord.held.length > 0 && chord.held.length >= this.failedPitches.length)
          this.failedPitches = chord.held.map((key) => key.pitch);
      } else if (!this.started || this.paused) {
        this.harmony.seedHeld(
          [...this.held.values()].flatMap((key) =>
            key.source
              ? [
                  {
                    source: key.source,
                    pitch: key.pitch,
                    atMs: times.raw,
                    correctedAtMs: times.corrected,
                    ...(key.deviceId ? { deviceId: key.deviceId } : {}),
                    ...(key.channel === undefined ? {} : { channel: key.channel })
                  }
                ]
              : []
          )
        );
      }
      return { events: [], eligible };
    }
    const accepted = this.capture.receive(event, {
      ...times,
      presentationId: this.identity.presentationId,
      songBeat,
      hand,
      admitted: times.admitted && allowed,
      playing: playing && this.started && !this.finished
    });
    if (accepted.down)
      return {
        eligible: true,
        events: session.pressKeyAt(
          event.pitch,
          times.corrected,
          times.received,
          event.deviceId ?? event.source
        )
      };
    if (accepted.up)
      return {
        eligible: true,
        events: session.releaseKeyAt(event.pitch, times.corrected, event.deviceId ?? event.source)
      };
    return { eligible: false, events: [] };
  }
  frame(session: PracticeSession, playing: boolean, atMs: number, offsetMs: number): void {
    this.recorder.observe(session, atMs);
    if (!this.recorder.valid || this.cancelled || !this.started || this.finished || !playing)
      return;
    if (this.activity.chords) {
      const accompaniment = this.activity.taskKind === "accompaniment";
      for (const step of this.activity.chords) {
        if (this.activity.chords[this.chordIndex] !== step) continue;
        this.presentChord(atMs, offsetMs);
        const snapshot = this.harmony.advance(atMs);
        const expectedSeconds = (step.startBeat * 60) / this.activity.exercise.bpm;
        const deadlineSeconds =
          expectedSeconds +
          (HARMONY_ONSET_WINDOW_MS + TWO_HAND_WINDOW_MS + TWO_HAND_HORIZON_MS) / 1000;
        const accepted = this.chordPresented && snapshot.status === "accepted";
        if (!accepted && (!accompaniment || session.time <= deadlineSeconds)) break;
        const firstAt =
          snapshot.completedAtMs === null || snapshot.spreadMs === null
            ? undefined
            : snapshot.completedAtMs - snapshot.spreadMs;
        const firstSeconds = firstAt === undefined ? undefined : session.songTimeAt(firstAt);
        const onsetOffsetMs =
          firstSeconds === undefined ? null : (firstSeconds - expectedSeconds) * 1000;
        const answer = {
          kind: "played" as const,
          target: step.target,
          playedPitches: accepted ? snapshot.acceptedPitches : this.failedPitches,
          spreadMs: accepted ? snapshot.spreadMs : null,
          attempts: this.chordPresented ? snapshot.attempts : [],
          startBeat: step.startBeat,
          hand: accompaniment ? ("left" as const) : ("right" as const),
          ...(accompaniment ? { onsetOffsetMs: accepted ? onsetOffsetMs : null } : {})
        };
        if (accepted) this.staffFeedback.chord(step.startBeat, answer.hand);
        this.answers.push(answer);
        this.failedPitches = [];
        this.chordIndex++;
        this.chordPresented = false;
        if (this.chordIndex >= this.activity.chords.length) this.finished = true;
        if (!accompaniment) break;
      }
    } else if (
      !this.dictation &&
      session.finished &&
      this.held.size === 0 &&
      (this.activity.expectedChoice === undefined || this.choiceMade)
    )
      this.finished = true;
  }
  finish(): MusicRunEvidence | null {
    if (!this.recorder.valid || this.cancelled) return null;
    if (this.completed) return this.completed;
    if (!this.started) return null;
    if (this.activity.integrated?.kind === "interval" && !this.choiceMade) return null;
    if (this.activity.chords && this.held.size > 0 && !this.finished) return null;
    const dictation = this.dictation?.finish() ?? null;
    if (this.dictation && !dictation) return null;
    const notes =
      this.activity.chords ||
      (this.activity.expectedChoice !== undefined && !this.activity.integrated)
        ? []
        : (dictation?.notes ?? this.capture.finish());
    if (notes === null) return null;
    const chord = this.activity.chords?.[this.chordIndex];
    const physical = this.harmony.snapshot();
    if (chord && physical.attempts.length > 0 && this.held.size === 0)
      this.answers.push({
        kind: "played",
        target: chord.target,
        playedPitches: this.failedPitches,
        spreadMs: null,
        attempts: physical.attempts,
        startBeat: chord.startBeat,
        hand: this.activity.taskKind === "accompaniment" ? "left" : "right"
      });
    this.finished = true;
    this.completed = {
      notes: notes.map((note) => ({
        pitch: note.pitch,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        hand: "hand" in note ? note.hand : "right"
      })),
      answers: this.answers.map((answer) => ({ ...answer })),
      dictation,
      help: this.help.map((help) => ({ ...help })),
      listening: this.dictation?.snapshot().listening ?? this.hearing,
      inputJournal: this.recorder.snapshot()
    };
    return this.completed;
  }
  snapshot(): {
    readonly started: boolean;
    readonly finished: boolean;
    readonly allReleased: boolean;
    readonly noteCount: number;
    readonly chordIndex: number;
    readonly choiceMade: boolean;
    readonly correctChoice: boolean;
    readonly chordError: HarmonyInputFailure | null;
    readonly canFinish: boolean;
    readonly valid: boolean;
  } {
    return {
      started: this.started,
      finished: this.finished,
      allReleased: this.held.size === 0,
      noteCount: this.dictation?.noteCount ?? this.capture.completedCount,
      chordIndex: this.chordIndex,
      choiceMade: this.choiceMade,
      correctChoice: this.correctChoice,
      chordError: this.activity.chords ? this.harmony.snapshot().reason : null,
      canFinish:
        this.recorder.valid &&
        !this.cancelled &&
        this.started &&
        this.held.size === 0 &&
        (this.activity.integrated?.kind !== "interval" || this.choiceMade) &&
        (this.dictation !== null ||
          this.answers.length > 0 ||
          this.capture.completedCount > 0 ||
          this.harmony.snapshot().attempts.length > 0),
      valid: this.recorder.valid
    };
  }
  cancel(atMs: number): void {
    this.cancelled = true;
    this.capture.cancel();
    this.dictation?.cancel(atMs);
    this.harmony.reset();
  }
}
