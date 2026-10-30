import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ensureMetronomeSound, metronomeSoundReady } from "../audio/pianoSound";
import { soundRhythmTap } from "../audio/rhythmTapSound";
import { generateRhythmExercise } from "../rhythm/generator";
import { RhythmSession } from "../rhythm/session";
import type { RhythmBpm, RhythmInputSource, RhythmOffsets, RhythmResult } from "../rhythm/types";
import type { Trainer } from "../practice/Trainer";
import type { TrainerRhythmPolicy } from "../practice/rhythmPolicy";
import type { TimingPreferences } from "./timingPreferences";
import { calibrationIsCurrent, getTimingProfile } from "./timingPreferences";
import { readingActions } from "./readingSlice";
import type { LessonStaffFeedbackSink } from "../staff/lessonStaffFeedback";
import { useLessonAcceptedFeedback } from "./useLessonAcceptedFeedback";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";

type Status =
  "idle" | "preparing" | "count-in" | "running" | "completed" | "empty" | "cancelled" | "error";
interface Connection {
  trainer: Trainer | null;
  blocked: boolean;
  deviceId?: string | undefined;
  timing: TimingPreferences;
}

export function useRhythmCourse(feedback?: LessonStaffFeedbackSink) {
  const saved = useAppSelector((state) => state.reading.rhythm);
  const active = useAppSelector((state) => state.reading.activeCourse === "rhythm-training");
  const revision = useAppSelector((state) => state.reading.selectionRevision);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const exercise = useMemo(
    () => (active ? generateRhythmExercise(saved.seed, saved.bpm, saved.generatorVersion) : null),
    [active, saved.seed, saved.bpm, saved.generatorVersion]
  );
  const feedbackRef = useLessonAcceptedFeedback(feedback, exercise);
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);
  const presentedIdRef = useRef<string | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const sessionRef = useRef<RhythmSession | null>(null);
  const runRef = useRef<{
    id: string;
    offsets: RhythmOffsets;
    presentationId: string;
    exerciseId: string;
  } | null>(null);
  const statusRef = useRef<Status>("idle");
  const requestRef = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<"audio" | "staff" | "midi" | undefined>();
  const [result, setResult] = useState<RhythmResult | null>(null);
  const [countInBeat, setCountInBeat] = useState(1);
  const [retry, setRetry] = useState(0);
  const [readyId, setReadyId] = useState<string | null>(null);
  const baseId = exercise ? `${exercise.id}:${String(revision)}:${String(retry)}` : "";
  const [runPresentation, setRunPresentation] = useState<{ baseId: string; runId: string } | null>(
    null
  );
  const id = runPresentation?.baseId === baseId ? `${baseId}:${runPresentation.runId}` : baseId;
  const idRef = useRef(id);
  useLayoutEffect(() => {
    idRef.current = id;
  }, [id]);
  const ready = readyId === baseId && !!exercise;
  const readyRef = useRef(ready);
  useLayoutEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  const changeStatus = useCallback((value: Status) => {
    statusRef.current = value;
    setStatus(value);
  }, []);
  const cancel = useCallback(
    (notify = true) => {
      if (activeRef.current || runRef.current || sessionRef.current) feedbackRef.current?.clear();
      presentedIdRef.current = null;
      requestRef.current++;
      const running = ["preparing", "count-in", "running"].includes(statusRef.current);
      // Guard the stop callback before freezing the musical clock.
      statusRef.current = "cancelled";
      if (running || sessionRef.current) connectionRef.current?.trainer?.setPlaying(false);
      sessionRef.current?.cancel();
      sessionRef.current = null;
      runRef.current = null;
      if (running && notify) setStatus("cancelled");
    },
    [feedbackRef]
  );
  const [selectionId, setSelectionId] = useState(baseId);
  if (selectionId !== baseId) {
    setSelectionId(baseId);
    setStatus("idle");
    setResult(null);
    setError(undefined);
  }
  useEffect(() => {
    cancel(false);
    statusRef.current = "idle";
    return () => {
      cancel(false);
    };
  }, [exercise, revision, cancel]);
  const offsetsFor = useCallback(
    (connection: Connection | null): RhythmOffsets => {
      if (!connection)
        return {
          inputOffsetMs: 0,
          manualInputOffsetMs: 0,
          audioOutputOffsetMs: 0,
          visualOffsetMs: 0,
          status: "uncalibrated"
        };
      const { timing } = connection;
      const deviceId = saved.inputSource === "midi" ? (connection.deviceId ?? "") : "keyboard";
      const profile = getTimingProfile(
        timing,
        deviceId,
        saved.inputSource === "midi" ? (timing.transports[deviceId] ?? "usb") : "local"
      );
      return {
        inputOffsetMs: profile?.inputOffsetMs ?? 0,
        manualInputOffsetMs: timing.manualOffsetMs,
        audioOutputOffsetMs: timing.audioOffsetMs,
        visualOffsetMs: timing.visualOffsetMs,
        status: calibrationIsCurrent(profile, timing.audioOffsetMs, timing.audioOutputId)
          ? "calibrated"
          : "uncalibrated"
      };
    },
    [saved.inputSource]
  );
  const policy = useMemo<TrainerRhythmPolicy | null>(
    () =>
      active
        ? {
            inputCompensationMs: () =>
              (runRef.current?.offsets.inputOffsetMs ?? 0) +
              (runRef.current?.offsets.manualInputOffsetMs ?? 0),
            accepts: (event) =>
              event.source === saved.inputSource &&
              (event.source !== "midi" || event.deviceId === connectionRef.current?.deviceId),
            onAttack(evidence) {
              const session = sessionRef.current;
              const run = runRef.current;
              if (!session || !run || !["count-in", "running"].includes(statusRef.current)) return;
              const attack = session.attack({
                ...evidence,
                runId: run.id,
                source: evidence.event.source ?? "pointer",
                ...(evidence.event.deviceId === undefined
                  ? {}
                  : { deviceId: evidence.event.deviceId }),
                pitch: evidence.event.source === "midi" ? evidence.event.pitch : 60,
                ...(evidence.event.channel === undefined ? {} : { channel: evidence.event.channel })
              });
              if (attack && evidence.event.source !== "midi") soundRhythmTap();
              const note =
                attack?.kind === "hit"
                  ? exercise?.song.notes.find((note) => note.id === attack.onsetId)
                  : undefined;
              if (
                attack &&
                note &&
                run.exerciseId === exercise?.id &&
                presentedIdRef.current === run.presentationId &&
                idRef.current === run.presentationId &&
                !connectionRef.current?.blocked &&
                document.visibilityState !== "hidden" &&
                store.getState().reading.selectionRevision === revision
              ) {
                feedbackRef.current?.publish({
                  runId: run.id,
                  presentationId: run.presentationId,
                  receiptId: attack.attemptId,
                  notes: [{ noteId: note.id, staffBeat: note.startBeat, pitch: note.pitch }]
                });
              }
            },
            onFrame(practice, playing) {
              if (!sessionRef.current || !["count-in", "running"].includes(statusRef.current))
                return;
              if (!playing && !practice.finished) {
                cancel();
                return;
              }
              if (
                !connectionRef.current ||
                connectionRef.current.blocked ||
                document.visibilityState === "hidden" ||
                !metronomeSoundReady()
              ) {
                cancel();
                return;
              }
              const session = sessionRef.current;
              session.advance(practice.time);
              if (practice.time < 0 && exercise) {
                const beat = Math.min(
                  4,
                  Math.max(
                    1,
                    Math.floor((practice.time + 240 / exercise.bpm) / (60 / exercise.bpm)) + 1
                  )
                );
                setCountInBeat((previous) => (previous === beat ? previous : beat));
              } else if (statusRef.current === "count-in") changeStatus("running");
              if (session.snapshot().status === "completed") {
                const completed = session.result(Date.now());
                // A run without a single attack says nothing about rhythm: it is not saved.
                const empty = completed?.attacks.length === 0;
                changeStatus(empty ? "empty" : "completed");
                connectionRef.current.trainer?.setPlaying(false);
                if (completed && !empty) {
                  setResult(completed);
                  dispatch(readingActions.rhythmResultAdded(completed));
                }
              }
            }
          }
        : null,
    [
      active,
      saved.inputSource,
      exercise,
      cancel,
      changeStatus,
      dispatch,
      feedbackRef,
      store,
      revision
    ]
  );
  const presentation = useMemo(
    () =>
      active
        ? {
            id,
            onPresented(shownId: string, atMs: number) {
              if (
                shownId !== idRef.current ||
                document.visibilityState === "hidden" ||
                !Number.isFinite(Math.max(atMs, performance.now()))
              )
                return;
              presentedIdRef.current = shownId;
              setReadyId(baseId);
              setError(undefined);
            },
            onError(shownId: string) {
              if (shownId !== idRef.current) return;
              cancel();
              setReadyId(null);
              setError("staff");
              changeStatus("error");
            }
          }
        : undefined,
    [active, id, baseId, cancel, changeStatus]
  );
  const onStart = useCallback(async () => {
    const connection = connectionRef.current;
    if (
      !exercise ||
      !connection?.trainer ||
      connection.blocked ||
      document.visibilityState === "hidden"
    )
      return;
    if (!readyRef.current) {
      setError("staff");
      changeStatus("error");
      return;
    }
    if (saved.inputSource === "midi" && !connection.deviceId) {
      setError("midi");
      changeStatus("error");
      return;
    }
    cancel();
    setResult(null);
    setError(undefined);
    changeStatus("preparing");
    const token = ++requestRef.current;
    const audioReady = await ensureMetronomeSound();
    if (
      token !== requestRef.current ||
      connectionRef.current !== connection ||
      connectionRef.current.blocked ||
      isHidden()
    )
      return;
    if (!audioReady) {
      setError("audio");
      changeStatus("error");
      return;
    }
    connection.trainer.restart();
    const runId = crypto.randomUUID();
    const run = {
      id: runId,
      offsets: offsetsFor(connection),
      presentationId: `${baseId}:${runId}`,
      exerciseId: exercise.id
    };
    setRunPresentation({ baseId, runId });
    runRef.current = run;
    sessionRef.current = new RhythmSession(exercise, {
      runId: run.id,
      source: saved.inputSource,
      deviceId: saved.inputSource === "midi" ? (connection.deviceId ?? "") : saved.inputSource,
      startedAt: Date.now(),
      startedAtMs: performance.now(),
      offsets: run.offsets
    });
    changeStatus("count-in");
    setCountInBeat(1);
    connection.trainer.setPlaying(true);
  }, [exercise, saved.inputSource, cancel, changeStatus, offsetsFor, baseId]);
  const select = (bpm: RhythmBpm, inputSource: RhythmInputSource, seed = saved.seed) => {
    cancel();
    dispatch(
      readingActions.rhythmSelected({
        bpm,
        inputSource,
        seed,
        generatorVersion: saved.generatorVersion
      })
    );
  };
  const tap = useCallback(
    (type: "down" | "up", source: "keyboard" | "pointer", atMs: number, identity: string) => {
      // Preserve physical identity until Trainer's held gate has seen the event.
      const pitch =
        identity === "key:Enter"
          ? 61
          : identity.startsWith("pointer:")
            ? 1000 + Number(identity.slice(8))
            : 60;
      connectionRef.current?.trainer?.key({
        type,
        pitch,
        velocity: 90,
        timestamp: atMs,
        source,
        deviceId: source
      });
    },
    []
  );
  const onTapDown = useCallback(
    (source: "keyboard" | "pointer", atMs: number, identity: string) => {
      tap("down", source, atMs, identity);
    },
    [tap]
  );
  const onTapUp = useCallback(
    (source: "keyboard" | "pointer", identity: string) => {
      tap("up", source, performance.now(), identity);
    },
    [tap]
  );
  const [connectionState, setConnectionState] = useState<Connection | null>(null);
  const refreshConnection = useCallback((connection: Connection) => {
    setConnectionState(connection);
  }, []);
  const offsets = offsetsFor(connectionState);
  return {
    active,
    exercise,
    status,
    result,
    history: saved.history,
    bpm: saved.bpm,
    source: saved.inputSource,
    ready,
    error,
    retry,
    renderError: error === "staff",
    presentation,
    connectionRef,
    policy,
    cancel,
    refreshConnection,
    compensated: offsets.status === "calibrated",
    effectiveOffsetMs: offsets.inputOffsetMs + offsets.manualInputOffsetMs,
    midiAvailable: !!connectionState?.deviceId,
    countInBeat,
    start: () => {
      select(saved.bpm, saved.inputSource);
    },
    onStart,
    onRepeat: onStart,
    onNewSeries: () => {
      select(saved.bpm, saved.inputSource, (saved.seed + 1) >>> 0);
    },
    onBpm: (bpm: RhythmBpm) => {
      select(bpm, saved.inputSource);
    },
    onSource: (source: RhythmInputSource) => {
      select(saved.bpm, source);
    },
    onExit: () => {
      cancel();
      dispatch(readingActions.exit());
    },
    onRetryStaff: () => {
      cancel();
      setRetry((value) => value + 1);
      setError(undefined);
      changeStatus("idle");
    },
    onTapDown,
    onTapUp
  };
}

export type RhythmCourseController = ReturnType<typeof useRhythmCourse>;

function isHidden(): boolean {
  return document.visibilityState === "hidden";
}
