import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { generateHeldBassExercise, nextHeldBassSeed } from "../reading/heldBassGenerator";
import { HeldBassSession } from "../reading/heldBassSession";
import type {
  HeldBassExercise,
  HeldBassFragment,
  HeldBassResult,
  HeldBassSnapshot
} from "../reading/heldBassTypes";
import { DEFAULT_READING_PREFERENCES, type ReadingHintLevel } from "../reading/types";
import type { TrainerHeldBassPolicy } from "../practice/heldBassPolicy";
import type { Trainer } from "../practice/Trainer";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";

interface Selection {
  active: boolean;
  seed: number;
  version: number;
  revision: number;
}
function selectedExercise(selection: Selection) {
  return selection.active ? generateHeldBassExercise(selection.seed, selection.version) : null;
}
function courseFor(exercise: HeldBassExercise | null) {
  if (!exercise) return null;
  const runId = crypto.randomUUID();
  const session = new HeldBassSession(exercise, DEFAULT_READING_PREFERENCES, {
    runId,
    startedAt: null
  });
  const first = exercise.fragments[0];
  if (first) session.prepare(first.id, 0);
  return { session, runId };
}
// The complete input includes the presentation identity: a retry must reload the Trainer's Song.
function sceneFor(input: { fragment: HeldBassFragment; presentationId: string }) {
  return { ...input.fragment, song: { ...input.fragment.song }, id: input.presentationId };
}
interface HintRequest {
  session: HeldBassSession;
  fragmentId: string;
  presentationId: string;
  step: number;
  level: ReadingHintLevel;
}

export function useHeldBassCourse() {
  const active = useAppSelector((state) => state.reading.activeCourse === "held-bass-reading");
  const saved = useAppSelector((state) => state.reading.heldBass);
  const preferences = useAppSelector((state) => state.reading.preferences);
  const revision = useAppSelector((state) => state.reading.selectionRevision);
  const dispatch = useAppDispatch();
  const [intro, setIntro] = useState(false);
  const selection = useMemo(
    () => ({ active, seed: saved.seed, version: saved.generatorVersion, revision }),
    [active, saved.seed, saved.generatorVersion, revision]
  );
  const exercise = useMemo(() => selectedExercise(selection), [selection]);
  const course = useMemo(() => courseFor(exercise), [exercise]);
  const session = course?.session ?? null;
  const [published, setPublished] = useState<{
    session: HeldBassSession;
    snapshot: HeldBassSnapshot;
    signature: string;
  } | null>(null);
  const [finished, setFinished] = useState<{
    session: HeldBassSession;
    result: HeldBassResult;
  } | null>(null);
  const [requested, setRequested] = useState<HintRequest | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sessionRef = useRef(session),
    requestedRef = useRef(requested);
  const finishedRef = useRef<HeldBassSession | null>(null);
  const blockedRef = useRef(false),
    errorRef = useRef(false),
    playRequestedRef = useRef(false);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useLayoutEffect(() => {
    requestedRef.current = requested;
  }, [requested]);
  useEffect(() => {
    session?.configure(preferences);
  }, [session, preferences]);
  const publish = useCallback(() => {
    if (!session) return;
    const snapshot = session.snapshot();
    const signature = JSON.stringify([
      snapshot.presentationId,
      snapshot.status,
      snapshot.step,
      snapshot.hintLevel,
      snapshot.active,
      snapshot.presented,
      snapshot.ready,
      snapshot.answers.length,
      snapshot.retryCommand?.revision
    ]);
    setPublished((old) =>
      old?.session === session && old.signature === signature
        ? old
        : { session, signature, snapshot }
    );
  }, [session]);
  const snapshot = published?.session === session ? published.snapshot : session?.snapshot();
  const fragment = exercise?.fragments.find((item) => item.id === snapshot?.fragmentId);
  const presentationId = snapshot?.presentationId ?? "";
  const sceneInput = useMemo(
    () => (fragment && presentationId ? { fragment, presentationId } : null),
    [fragment, presentationId]
  );
  const scene = useMemo(() => (sceneInput ? sceneFor(sceneInput) : null), [sceneInput]);
  const id = `${presentationId}:${String(retry)}`;
  const idRef = useRef(id);
  useLayoutEffect(() => {
    idRef.current = id;
  }, [id]);
  const renderError = errorId === id;
  useLayoutEffect(() => {
    errorRef.current = renderError;
  }, [renderError]);
  const hintLevel =
    requested?.session === session &&
    requested.presentationId === presentationId &&
    requested.step === snapshot?.step
      ? requested.level
      : (snapshot?.hintLevel ?? 0);
  const requestHint = useCallback(
    (state: HeldBassSnapshot, level: ReadingHintLevel) => {
      if (!session || !state.fragmentId || !state.presentationId) return;
      const value = {
        session,
        fragmentId: state.fragmentId,
        presentationId: state.presentationId,
        step: state.step,
        level
      };
      setRequested((old) =>
        old?.session === session &&
        old.presentationId === value.presentationId &&
        old.step === value.step &&
        old.level >= level
          ? old
          : value
      );
    },
    [session]
  );
  const finish = useCallback(() => {
    if (!session || finishedRef.current === session) return;
    const result = session.result(Date.now());
    if (!result) return;
    finishedRef.current = session;
    dispatch(readingActions.heldBassResultAdded(result));
    setFinished({ session, result });
  }, [session, dispatch]);
  const transition = useCallback(
    (playing: boolean, now: number) => {
      if (!session || !exercise) return;
      const state = session.snapshot();
      if (state.completed) {
        finish();
        return;
      }
      const next = exercise.fragments[state.answers.length];
      if (state.retryCommand || (next && next.id !== state.fragmentId)) {
        const fragmentId = state.retryCommand?.fragmentId ?? next?.id;
        if (fragmentId) {
          session.prepare(fragmentId, now);
          if (session.snapshot().presentationId !== state.presentationId) {
            playRequestedRef.current =
              playing && !blockedRef.current && document.visibilityState !== "hidden";
          }
        }
      }
    },
    [session, exercise, finish]
  );
  const policy = useMemo<TrainerHeldBassPolicy | null>(() => {
    if (!session || !course || !fragment || !presentationId) return null;
    const live = () =>
      sessionRef.current === session && session.snapshot().presentationId === presentationId;
    return {
      onsets: {
        runId: course.runId,
        fragmentId: fragment.id,
        presentationId,
        steps: fragment.steps
      },
      onFrame(_practice, playing, now, receipt) {
        if (!live()) return;
        const enabled =
          playing &&
          !blockedRef.current &&
          !errorRef.current &&
          document.visibilityState !== "hidden";
        session.setActive(enabled, now);
        if (enabled && session.snapshot().presented) session.markStarted(Date.now());
        session.tick(now, receipt);
        const state = session.snapshot();
        const wanted = session.suggestHint(now);
        if (wanted > state.hintLevel) requestHint(state, wanted);
        transition(playing, now);
        publish();
        if (live()) return session.snapshot().pendingCommit ?? undefined;
      },
      onInput(event, _practice, _playing, raw, corrected, received, receipt) {
        if (!live()) return;
        session.input(
          {
            kind: event.type,
            pitch: event.pitch,
            source: event.source ?? "pointer",
            atMs: raw,
            offsetMs: raw - corrected,
            ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
            ...(event.channel === undefined ? {} : { channel: event.channel })
          },
          received,
          receipt
        );
        publish();
      },
      onCommit(request, accepted, receipt) {
        if (!live()) return;
        const commit = session.snapshot().pendingCommit;
        if (
          commit?.runId !== request.runId ||
          commit.presentationId !== request.presentationId ||
          commit.step !== request.step
        )
          return;
        session.acknowledgeOnset(commit, accepted, receipt);
        if (!accepted) setErrorId(idRef.current);
        publish();
      },
      cancel(now, resetAll) {
        if (!live()) return;
        if (resetAll) session.resetInput(now);
        else session.cancel(now);
        publish();
      },
      seedHeld(events, now) {
        if (!live()) return;
        session.seedHeld(
          events.map((event) => ({
            kind: event.type,
            pitch: event.pitch,
            source: event.source ?? "pointer",
            atMs: event.timestamp ?? now,
            ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
            ...(event.channel === undefined ? {} : { channel: event.channel })
          })),
          now
        );
        publish();
      },
      cuePitches() {
        const state = session.snapshot(),
          wanted = requestedRef.current;
        return live() &&
          state.ready &&
          (state.hintLevel === 2 ||
            (wanted?.session === session &&
              wanted.presentationId === presentationId &&
              wanted.step === state.step &&
              wanted.level === 2)) &&
          state.targetPitch !== null
          ? [fragment.bassPitch, state.targetPitch]
          : [];
      },
      onCuePresented(pitches, now) {
        if (!live()) return;
        const state = session.snapshot();
        if (
          state.targetPitch !== null &&
          pitches.includes(fragment.bassPitch) &&
          pitches.includes(state.targetPitch)
        ) {
          session.showHint(fragment.id, state.step, 2, now);
          publish();
        }
      }
    };
  }, [session, course, fragment, presentationId, requestHint, transition, publish]);
  const presentation = useMemo(
    () =>
      session && fragment
        ? {
            id,
            onPresented(shownId: string, atMs: number) {
              if (
                shownId !== idRef.current ||
                sessionRef.current !== session ||
                session.snapshot().presentationId !== presentationId
              )
                return;
              session.present(fragment.id, Math.max(atMs, performance.now()));
              publish();
            },
            onError(shownId: string) {
              if (shownId !== idRef.current || sessionRef.current !== session) return;
              setErrorId(shownId);
              session.setActive(false, performance.now());
              publish();
            }
          }
        : undefined,
    [session, fragment, presentationId, id, publish]
  );
  useEffect(() => {
    if (!session || !fragment || hintLevel < 1 || !snapshot?.ready) return;
    const step = snapshot.step;
    const frame = requestAnimationFrame((now) => {
      if (
        sessionRef.current === session &&
        session.snapshot().presentationId === presentationId &&
        session.snapshot().step === step &&
        document.visibilityState !== "hidden"
      ) {
        session.showHint(fragment.id, step, 1, now);
        publish();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [session, fragment, presentationId, hintLevel, snapshot?.ready, snapshot?.step, publish]);
  const suspend = useCallback(() => {
    session?.setActive(false, performance.now());
    publish();
  }, [session, publish]);
  const result = finished?.session === session ? finished.result : null;
  return {
    active,
    exercise,
    scene,
    session,
    snapshot,
    fragment,
    policy,
    presentation,
    renderError,
    retry,
    prompt: scene ? { musicXml: scene.musicXml, beat: undefined } : null,
    index: snapshot?.fragmentIndex ?? 0,
    hintLevel,
    preferences,
    intro,
    setIntro,
    blockedRef,
    playRequestedRef,
    suspend,
    finish,
    result,
    history: saved.history,
    sourceFilter: saved.sourceFilter,
    start: () => {
      setIntro(false);
      dispatch(readingActions.heldBassSelected({ seed: saved.seed }));
    },
    playAgain: async (ensureSound: () => Promise<void>) => {
      await ensureSound();
      if (sessionRef.current !== session || !session) return;
      playRequestedRef.current = true;
      dispatch(
        readingActions.heldBassSelected({
          seed: saved.seed,
          generatorVersion: saved.generatorVersion
        })
      );
    },
    newSeries: () => {
      dispatch(
        readingActions.heldBassSelected({
          seed: nextHeldBassSeed(saved.seed),
          generatorVersion: saved.generatorVersion
        })
      );
    },
    exit: () => {
      dispatch(readingActions.exit());
    },
    setSourceFilter: (value: typeof saved.sourceFilter) => {
      dispatch(readingActions.heldBassSourceFilterChanged(value));
    },
    updatePreferences: (value: Partial<typeof preferences>) => {
      dispatch(readingActions.preferencesChanged(value));
    },
    hint: () => {
      const state = session?.snapshot();
      if (state?.ready) requestHint(state, Math.min(2, hintLevel + 1) as ReadingHintLevel);
    },
    onRetry: () => {
      if (fragment) session?.requirePresentation(fragment.id, performance.now());
      setErrorId(null);
      setRetry((value) => value + 1);
      publish();
    }
  };
}

export function useHeldBassTrainer(
  course: ReturnType<typeof useHeldBassCourse>,
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean
) {
  const { policy, blockedRef, playRequestedRef, suspend, result } = course;
  useEffect(() => {
    blockedRef.current = blocked;
    if (blocked) suspend();
  }, [blocked, blockedRef, suspend]);
  useEffect(() => {
    if (!ready) return;
    const trainer = trainerRef.current;
    trainer?.configureCourse("heldBass", policy);
    if (playRequestedRef.current && trainer && policy) {
      playRequestedRef.current = false;
      if (!blockedRef.current) trainer.setPlaying(true);
    }
    const hidden = () => {
      if (document.visibilityState === "hidden") trainer?.cancelInput(true);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      trainer?.configureCourse("heldBass", null);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [policy, trainerRef, ready, blockedRef, playRequestedRef]);
  useEffect(() => {
    if (result && ready) trainerRef.current?.setPlaying(false);
  }, [result, ready, trainerRef]);
}
