import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  generateTwoHandExercise,
  nextTwoHandSeed,
  twoHandPromptXml
} from "../reading/twoHandGenerator";
import { TwoHandSession } from "../reading/twoHandSession";
import type { TwoHandResult } from "../reading/twoHandTypes";
import { DEFAULT_READING_PREFERENCES, type ReadingHintLevel } from "../reading/types";
import type { TrainerPairPolicy } from "../practice/twoHandPolicy";
import type { Trainer } from "../practice/Trainer";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import { useI18n } from "./useI18n";
import { messages } from "../i18n/messages";
import { translate } from "../i18n/translate";
import { twoHandNoteName } from "../ui/TwoHandProgress";

interface TwoHandSelection {
  active: boolean;
  seed: number;
  version: number;
  revision: number;
}

// A selection is a new run even when its musical seed is unchanged. Keep the whole
// selection as this call's input so compiler memoization preserves that identity.
function selectedExercise(selection: TwoHandSelection) {
  return selection.active ? generateTwoHandExercise(selection.seed, selection.version) : null;
}

export function useTwoHandCourse() {
  const active = useAppSelector((state) => state.reading.activeCourse === "two-hand-coordination");
  const saved = useAppSelector((state) => state.reading.coordination);
  const preferences = useAppSelector((state) => state.reading.preferences);
  const revision = useAppSelector((state) => state.reading.selectionRevision);
  const dispatch = useAppDispatch();
  const [intro, setIntro] = useState(false);
  const selection = useMemo(
    () => ({ active, seed: saved.seed, version: saved.generatorVersion, revision }),
    [active, saved.seed, saved.generatorVersion, revision]
  );
  const exercise = useMemo(() => selectedExercise(selection), [selection]);
  const session = useMemo(() => {
    if (!exercise) return null;
    const run = new TwoHandSession(exercise, DEFAULT_READING_PREFERENCES, {
      runId: `${crypto.randomUUID()}:${String(revision)}`,
      startedAt: null
    });
    const first = exercise.pairs[0];
    if (first) run.prepare(first.id, 0);
    return run;
  }, [exercise, revision]);
  const [published, setPublished] = useState<{
    session: TwoHandSession;
    signature: string;
    snapshot: ReturnType<TwoHandSession["snapshot"]>;
  } | null>(null);
  const [finished, setFinished] = useState<{
    session: TwoHandSession;
    result: TwoHandResult;
  } | null>(null);
  const [requested, setRequested] = useState<{
    session: TwoHandSession;
    pairId: string;
    level: ReadingHintLevel;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [errorId, setErrorId] = useState<string | null>(null);
  const blockedRef = useRef(false);
  const playRequestedRef = useRef(false);
  const errorRef = useRef(false);
  const sessionRef = useRef(session);
  const requestedRef = useRef(requested);
  const commitRef = useRef<{ session: TwoHandSession; pairId: string; accepted: boolean } | null>(
    null
  );
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
      snapshot.pairId,
      snapshot.status,
      snapshot.hintLevel,
      snapshot.active,
      snapshot.presented,
      snapshot.answers.length
    ]);
    setPublished((old) =>
      old?.session === session && old.signature === signature
        ? old
        : { session, signature, snapshot }
    );
  }, [session]);
  const snapshot = published?.session === session ? published.snapshot : session?.snapshot();
  const pair = exercise?.pairs.find((item) => item.id === snapshot?.pairId);
  const index = pair && exercise ? exercise.pairs.indexOf(pair) : 0;
  const hintLevel =
    requested?.session === session && requested.pairId === pair?.id
      ? requested.level
      : (snapshot?.hintLevel ?? 0);
  const { locale } = useI18n();
  // The staff names a hinted note exactly as the hint line beside it does.
  const prompt = useMemo(
    () =>
      exercise
        ? twoHandPromptXml(exercise, index, hintLevel, (pitch) =>
            twoHandNoteName(pitch, (key) => translate(locale, messages, key))
          )
        : null,
    [exercise, index, hintLevel, locale]
  );
  const id =
    exercise && pair ? `${exercise.id}:${String(revision)}:${pair.id}:${String(retry)}` : "";
  const idRef = useRef(id);
  useLayoutEffect(() => {
    idRef.current = id;
  }, [id]);
  const renderError = errorId === id;
  useLayoutEffect(() => {
    errorRef.current = renderError;
  }, [renderError]);
  const finish = useCallback(() => {
    if (
      !session ||
      finished?.session === session ||
      commitRef.current?.session !== session ||
      !commitRef.current.accepted
    )
      return;
    const result = session.result(crypto.randomUUID(), Date.now());
    if (result) {
      dispatch(readingActions.twoHandResultAdded(result));
      setFinished({ session, result });
    }
  }, [session, finished, dispatch]);
  const requestHint = useCallback(
    (level: ReadingHintLevel, pairId: string) => {
      if (!session) return;
      setRequested((old) =>
        old?.session === session && old.pairId === pairId && old.level >= level
          ? old
          : { session, pairId, level }
      );
    },
    [session]
  );
  const policy = useMemo<TrainerPairPolicy | null>(
    () =>
      session && exercise
        ? {
            onFrame(practice, playing, now) {
              const due = practice.nextDue();
              const next = exercise.pairs.find((item) =>
                item.noteIds.every((noteId) => due.some((note) => note.id === noteId))
              );
              if (next && next.id !== session.snapshot().pairId) session.prepare(next.id, now);
              const enabled =
                playing &&
                practice.waiting &&
                !blockedRef.current &&
                !errorRef.current &&
                document.visibilityState !== "hidden";
              session.setActive(enabled, now);
              if (enabled && session.snapshot().presented) session.markStarted(Date.now());
              session.tick(now);
              const state = session.snapshot();
              const wanted = session.suggestHint(now);
              if (wanted > state.hintLevel && state.pairId) requestHint(wanted, state.pairId);
              publish();
              const commit = state.lastCommit;
              if (
                commit &&
                (commitRef.current?.session !== session ||
                  commitRef.current.pairId !== commit.pairId)
              )
                return commit.noteIds;
            },
            onInput(event, _practice, _playing, raw, corrected, received) {
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
                received
              );
              publish();
            },
            onCommit(noteIds, accepted, now) {
              const commit = session.snapshot().lastCommit;
              if (!commit?.noteIds.every((noteId) => noteIds.includes(noteId))) return;
              commitRef.current = { session, pairId: commit.pairId, accepted };
              if (!accepted) {
                session.cancel(now);
                setErrorId(idRef.current);
              } else finish();
              publish();
            },
            cancel(now, resetAll) {
              if (resetAll) session.resetInput(now);
              else session.cancel(now);
              publish();
            },
            seedHeld(events, now) {
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
              const state = session.snapshot();
              return state.active &&
                state.presented &&
                requestedRef.current?.session === session &&
                requestedRef.current.pairId === state.pairId &&
                requestedRef.current.level === 2
                ? (exercise.pairs.find((item) => item.id === state.pairId)?.pitches ?? [])
                : [];
            },
            onCuePresented(pitches, now) {
              const state = session.snapshot();
              const current = exercise.pairs.find((item) => item.id === state.pairId);
              if (current?.pitches.every((pitch) => pitches.includes(pitch)))
                session.showHint(current.id, 2, now);
              publish();
            }
          }
        : null,
    [session, exercise, requestHint, publish, finish]
  );
  const presentation = useMemo(
    () =>
      session && pair
        ? {
            id,
            onPresented(shownId: string, atMs: number) {
              if (shownId !== idRef.current || sessionRef.current !== session) return;
              session.present(pair.id, Math.max(atMs, performance.now()));
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
    [session, pair, id, publish]
  );
  useEffect(() => {
    if (!session || !pair || hintLevel < 1 || !snapshot?.active || !snapshot.presented) return;
    const frame = requestAnimationFrame((now) => {
      if (sessionRef.current === session && document.visibilityState !== "hidden") {
        session.showHint(pair.id, 1, now);
        publish();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [session, pair, hintLevel, snapshot?.active, snapshot?.presented, publish]);
  const suspend = useCallback(() => {
    session?.setActive(false, performance.now());
    publish();
  }, [session, publish]);
  return {
    active,
    exercise,
    session,
    snapshot,
    policy,
    prompt,
    presentation,
    index,
    pair,
    hintLevel,
    renderError,
    retry,
    preferences,
    blockedRef,
    playRequestedRef,
    suspend,
    finish,
    intro,
    setIntro,
    history: saved.history,
    sourceFilter: saved.sourceFilter,
    result: finished?.session === session ? finished.result : null,
    start: () => {
      setIntro(false);
      dispatch(readingActions.twoHandSelected({ seed: saved.seed }));
    },
    playAgain: async (ensureSound: () => Promise<void>) => {
      await ensureSound();
      if (sessionRef.current !== session || !session) return;
      playRequestedRef.current = true;
      dispatch(
        readingActions.twoHandSelected({
          seed: saved.seed,
          generatorVersion: saved.generatorVersion
        })
      );
    },
    exit: () => dispatch(readingActions.exit()),
    newSeries: () =>
      dispatch(
        readingActions.twoHandSelected({
          seed: nextTwoHandSeed(saved.seed),
          generatorVersion: saved.generatorVersion
        })
      ),
    setSourceFilter: (value: typeof saved.sourceFilter) =>
      dispatch(readingActions.twoHandSourceFilterChanged(value)),
    updatePreferences: (value: Partial<typeof preferences>) =>
      dispatch(readingActions.preferencesChanged(value)),
    hint: () => {
      if (pair && snapshot?.active && snapshot.presented)
        requestHint(Math.min(2, hintLevel + 1) as ReadingHintLevel, pair.id);
    },
    onRetry: () => {
      if (pair) session?.requirePresentation(pair.id, performance.now());
      setErrorId(null);
      setRetry((value) => value + 1);
      publish();
    }
  };
}

export function useTwoHandTrainer(
  course: ReturnType<typeof useTwoHandCourse>,
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean
) {
  const { policy, blockedRef, suspend, playRequestedRef } = course;
  useEffect(() => {
    blockedRef.current = blocked;
    if (blocked) suspend();
  }, [blocked, blockedRef, suspend]);
  useEffect(() => {
    if (!ready) return;
    const trainer = trainerRef.current;
    trainer?.configureCourse("pair", policy);
    if (playRequestedRef.current && trainer && policy) {
      playRequestedRef.current = false;
      if (!blockedRef.current) trainer.setPlaying(true);
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") trainer?.cancelInput(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      trainer?.configureCourse("pair", null);
      document.removeEventListener("visibilitychange", onVisibility);
      suspend();
    };
  }, [policy, trainerRef, ready, suspend, playRequestedRef, blockedRef]);
}
