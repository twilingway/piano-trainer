import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createIntervalPreview } from "../audio/intervalPreview";
import type { IntervalSession } from "../intervals/session";
import type { IntervalExercise, IntervalCategory } from "../intervals/types";
import type { Trainer } from "../practice/Trainer";

/** Audio owns wall-time jobs only; the ordinary musical session remains paused. */
export function useIntervalAudio(
  exercise: IntervalExercise | null,
  session: IntervalSession | null,
  publish: () => void
) {
  const previewRef = useRef<ReturnType<typeof createIntervalPreview> | null>(null);
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const generationRef = useRef(0);
  const blockedRef = useRef(false);
  const [pausedSession, setPausedSession] = useState<IntervalSession | null>(null);
  const [errorSession, setErrorSession] = useState<IntervalSession | null>(null);
  const ear = exercise?.mode === "hear-and-choose";
  const paused = pausedSession === session && session !== null;
  const suspend = useCallback(() => {
    previewRef.current?.cancel();
    session?.setActive(false, performance.now());
    publish();
  }, [session, publish]);
  useEffect(() => {
    if (!ear || !session) return;
    const preview = createIntervalPreview(session.identity()?.runId ?? crypto.randomUUID());
    previewRef.current = preview;
    const visibility = () => {
      if (document.visibilityState === "hidden") suspend();
      else if (!blockedRef.current && !paused) {
        session.setActive(true, performance.now());
        publish();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      preview.dispose();
      if (previewRef.current === preview) previewRef.current = null;
      session.setActive(false, performance.now());
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [ear, session, publish, suspend, paused]);

  const listen = useCallback(() => {
    if (!ear || !session || paused || blockedRef.current || document.visibilityState === "hidden")
      return;
    const state = session.snapshot();
    const pair = exercise.pairs[state.questionIndex];
    const identity = session.identity();
    const preview = previewRef.current;
    if (!pair || !identity || !preview || state.listening || state.completed) return;
    const generation = ++generationRef.current;
    session.setActive(true, performance.now());
    session.markStarted(Date.now());
    session.listeningStarted(identity, generation, performance.now());
    setErrorSession(null);
    publish();
    const current = () => sessionRef.current === session && generationRef.current === generation;
    void preview.play({
      runId: identity.runId,
      questionId: identity.questionId,
      pitches: [pair.anchorMidi, pair.targetMidi],
      onStarted: publish,
      onCompleted() {
        if (!current()) return;
        session.listeningCompleted(identity, generation, performance.now());
        publish();
      },
      onCancelled({ partial }) {
        if (!current()) return;
        session.listeningCancelled(identity, generation, performance.now(), partial);
        publish();
      },
      onError() {
        if (!current()) return;
        session.listeningCancelled(identity, generation, performance.now(), false);
        setErrorSession(session);
        publish();
      }
    });
  }, [ear, exercise, session, paused, publish]);

  const answer = useCallback(
    (category: IntervalCategory, source: "keyboard" | "pointer") => {
      if (!session || blockedRef.current || paused || document.visibilityState === "hidden") return;
      const identity = session.identity();
      if (identity) session.answerCategory(identity, category, source, performance.now());
      publish();
    },
    [session, paused, publish]
  );
  const togglePause = useCallback(() => {
    if (!session || !ear) return;
    if (paused) {
      setPausedSession(null);
      session.setActive(
        !blockedRef.current && document.visibilityState !== "hidden",
        performance.now()
      );
      publish();
    } else {
      suspend();
      setPausedSession(session);
    }
  }, [session, ear, paused, suspend, publish]);
  return {
    ear,
    paused,
    error: errorSession === session && session !== null,
    listen,
    answer,
    togglePause,
    suspend,
    blockedRef
  };
}

export function useIntervalAudioTrainer(
  audio: ReturnType<typeof useIntervalAudio>,
  session: IntervalSession | null,
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean,
  publish: () => void
) {
  const { ear, paused, blockedRef, suspend } = audio;
  useEffect(() => {
    blockedRef.current = blocked;
    if (!ear || !session) return;
    if (blocked || paused || document.visibilityState === "hidden") suspend();
    else {
      session.setActive(true, performance.now());
      publish();
    }
  }, [ear, session, blocked, paused, blockedRef, suspend, publish]);
  useEffect(() => {
    if (ear && ready) trainerRef.current?.setPlaying(false);
  }, [ear, session, ready, trainerRef]);
}
