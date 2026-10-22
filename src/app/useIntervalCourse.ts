import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { generateIntervalExercise, nextIntervalSeed } from "../intervals/generator";
import { intervalPromptXml } from "../intervals/prompt";
import { IntervalSession } from "../intervals/session";
import type { IntervalMode, IntervalSnapshot, IntervalSourceFilter } from "../intervals/types";
import type { TrainerReadingPolicy } from "../practice/readingPolicy";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import { useIntervalAudio } from "./useIntervalAudio";

export function useIntervalCourse() {
  const saved = useAppSelector((state) => state.reading.intervals);
  const activeCourse = useAppSelector((state) => state.reading.activeCourse);
  const revision = useAppSelector((state) => state.reading.selectionRevision);
  const dispatch = useAppDispatch();
  const active = activeCourse === "interval-training";
  const mode = saved.mode ?? "see-and-play";
  const selectionKey = JSON.stringify({
    mode,
    seed: saved.seed,
    generatorVersion: saved.generatorVersion,
    revision
  });
  const exercise = useMemo(() => {
    const selected = JSON.parse(selectionKey) as {
      mode: IntervalMode;
      seed: number;
      generatorVersion: number;
    };
    return active
      ? generateIntervalExercise(selected.mode, selected.seed, selected.generatorVersion)
      : null;
  }, [active, selectionKey]);
  const run = useMemo(
    () => (exercise ? { runId: crypto.randomUUID(), startedAt: null } : null),
    [exercise]
  );
  const session = useMemo(
    () => (exercise && run ? new IntervalSession(exercise, run) : null),
    [exercise, run]
  );
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const blockedRef = useRef(false);
  const errorRef = useRef(false);
  const publishedResult = useRef<IntervalSession | null>(null);
  const [published, setPublished] = useState<{
    session: IntervalSession;
    snapshot: IntervalSnapshot;
  } | null>(null);
  const publish = useCallback(() => {
    if (!session) return;
    const snapshot = session.snapshot();
    setPublished((previous) =>
      previous?.session === session && previous.snapshot === snapshot
        ? previous
        : { session, snapshot }
    );
  }, [session]);
  const snapshot = published?.session === session ? published.snapshot : session?.snapshot();
  useEffect(() => {
    if (!session || !snapshot?.completed || publishedResult.current === session) return;
    const result = session.result(crypto.randomUUID(), Date.now());
    if (!result) return;
    publishedResult.current = session;
    dispatch(readingActions.intervalResultAdded(result));
  }, [session, snapshot?.completed, dispatch]);
  const [retry, setRetry] = useState(0);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [helpRequest, setHelpRequest] = useState<string | null>(null);
  const questionIndex = Math.min(9, snapshot?.questionIndex ?? 0);
  const pair = exercise?.pairs[questionIndex];
  // Changing the cursor's beat does not re-parse or re-render the same pair's score.
  const pairXml = useMemo(
    () => (exercise ? intervalPromptXml(exercise.musicXml, questionIndex).musicXml : undefined),
    [exercise, questionIndex]
  );
  const id = session
    ? `${session.identity()?.runId ?? ""}:${snapshot?.questionId ?? "done"}:${String(retry)}`
    : "";
  const idRef = useRef(id);
  useLayoutEffect(() => {
    idRef.current = id;
  }, [id]);
  const renderError = id === errorId;
  useLayoutEffect(() => {
    errorRef.current = renderError;
  }, [renderError]);
  const suspend = useCallback(() => {
    session?.setActive(false, performance.now());
    publish();
  }, [session, publish]);
  const policy = useMemo<TrainerReadingPolicy | null>(
    () =>
      session && exercise
        ? {
            onFrame(practice, playing, atMs) {
              if (exercise.mode !== "see-and-play") return;
              const state = session.snapshot();
              session.setActive(
                playing &&
                  practice.waiting &&
                  practice.nextDue()[0]?.id === state.expectedNoteId &&
                  !blockedRef.current &&
                  !errorRef.current &&
                  document.visibilityState !== "hidden",
                atMs
              );
              publish();
            },
            allowInput(_event, practice, atMs) {
              const state = session.snapshot();
              const identity = session.identity();
              return (
                exercise.mode === "see-and-play" &&
                identity !== null &&
                session.canAnswerAt(identity, atMs) &&
                practice.nextDue()[0]?.id === state.expectedNoteId &&
                !blockedRef.current &&
                !errorRef.current &&
                document.visibilityState !== "hidden" &&
                Number.isFinite(atMs)
              );
            },
            onJudgement(event, events, atMs) {
              const identity = session.identity();
              if (
                identity &&
                events.some((value) => value.type === "hit" || value.type === "wrong")
              ) {
                session.answerPitch(identity, event.pitch, event.source ?? "pointer", atMs);
                publish();
              }
            },
            cuePitch: () => undefined
          }
        : null,
    [session, exercise, publish]
  );
  const presentation = useMemo(
    () =>
      session && exercise?.mode === "see-and-play"
        ? {
            id,
            onPresented(shownId: string, atMs: number) {
              if (
                shownId !== id ||
                idRef.current !== id ||
                sessionRef.current !== session ||
                document.visibilityState === "hidden"
              )
                return;
              const identity = session.identity();
              // RAF timestamps precede other callbacks in the same frame. Acknowledge receipt
              // after Trainer's updates, so the current painted pair cannot look like a stale event.
              if (identity) session.present(identity, Math.max(atMs, performance.now()));
              if (session.snapshot().presented) session.markStarted(Date.now());
              publish();
            },
            onError(shownId: string) {
              if (shownId !== id || idRef.current !== id || sessionRef.current !== session) return;
              setErrorId(id);
              const identity = session.identity();
              if (identity) session.requirePresentation(identity, performance.now());
              suspend();
            }
          }
        : undefined,
    [session, exercise?.mode, id, publish, suspend]
  );
  const audio = useIntervalAudio(exercise, session, publish);
  const start = useCallback(
    (mode: IntervalMode) => {
      dispatch(readingActions.intervalSelected({ mode, seed: nextIntervalSeed(saved.seed) }));
    },
    [saved.seed, dispatch]
  );
  const questionId = snapshot?.questionId;
  const onHelpPresented = useCallback(() => {
    if (
      !session ||
      sessionRef.current !== session ||
      idRef.current !== id ||
      helpRequest !== id ||
      blockedRef.current ||
      document.visibilityState === "hidden"
    )
      return;
    const identity = session.identity();
    if (!identity || identity.questionId !== questionId) return;
    session.showHelp(identity, performance.now());
    publish();
  }, [session, id, helpRequest, questionId, publish]);
  return {
    active,
    exercise,
    session,
    snapshot,
    policy,
    presentation,
    blockedRef,
    suspend,
    publish,
    mode,
    sourceFilter: saved.sourceFilter,
    history: saved.history,
    pair,
    index: questionIndex,
    retry,
    renderError,
    helpShown:
      (snapshot?.helpShown ?? false) || (helpRequest === id && snapshot?.canAnswer === true),
    onHelpPresented,
    audio,
    prompt: pairXml ? { musicXml: pairXml, beat: snapshot?.noteRole ?? 0 } : null,
    result: snapshot?.completed
      ? (saved.history.find((result) => result.runId === run?.runId) ?? null)
      : null,
    start,
    newSeries: () => {
      start(mode);
    },
    exit: () => dispatch(readingActions.exit()),
    setSourceFilter: (source: IntervalSourceFilter) =>
      dispatch(readingActions.intervalSourceFilterChanged(source)),
    hint: () => {
      if (!session || blockedRef.current || document.visibilityState === "hidden") return;
      const identity = session.identity();
      if (identity && session.snapshot().canAnswer) setHelpRequest(id);
    },
    onRetry: () => {
      const identity = session?.identity();
      if (identity) session?.requirePresentation(identity, performance.now());
      setRetry((value) => value + 1);
      setErrorId(null);
      publish();
    }
  };
}
