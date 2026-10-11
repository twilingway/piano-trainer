import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateReadingExercise } from "../reading/generator";
import { readingFingerprint } from "../reading/adaptation";
import { readingPromptXml } from "../reading/prompt";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import type { ReadingHintLevel, ReadingPreferences, ReadingResult } from "../reading/types";
import type { TrainerReadingPolicy } from "../practice/readingPolicy";
import type { Trainer } from "../practice/Trainer";
import type { RefObject } from "react";
import { readingActions, type ReadingState } from "./readingSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";
import { useReadingGeneration } from "./useReadingGeneration";

export function useReadingCourse() {
  const saved = useAppSelector((state) => state.reading);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [intro, setIntro] = useState(false);
  const [wallNow, setWallNow] = useState(() => Date.now());
  const refreshClock = useCallback(() => {
    setWallNow(Date.now());
  }, []);
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refreshClock();
    };
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refreshClock]);
  const [retry, setRetry] = useState(0);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [renderedHint, setRenderedHint] = useState<{ id: string; level: ReadingHintLevel } | null>(
    null
  );
  const selectionKey = JSON.stringify({
    task: saved.activeCourse === "note-reading" ? saved.task : null,
    seed: saved.seed,
    plan: saved.plan,
    revision: saved.selectionRevision
  });
  const exercise = useMemo(() => {
    const selection = JSON.parse(selectionKey) as Pick<ReadingState, "task" | "seed" | "plan">;
    return selection.task
      ? generateReadingExercise(selection.task, selection.seed, selection.plan ?? undefined)
      : null;
  }, [selectionKey]);
  const run = useMemo(
    () =>
      exercise
        ? {
            runId: crypto.randomUUID(),
            startedAt: null,
            newMaterial: false
          }
        : null,
    [exercise]
  );
  const session = useMemo(
    () => (exercise && run ? new ReadingSession(exercise, DEFAULT_READING_PREFERENCES, run) : null),
    [exercise, run]
  );
  const [published, setPublished] = useState<{
    session: ReadingSession;
    snapshot: ReturnType<ReadingSession["snapshot"]>;
  } | null>(null);
  const [finished, setFinished] = useState<{
    session: ReadingSession;
    result: ReadingResult;
  } | null>(null);
  const blockedRef = useRef(false);
  const errorRef = useRef(false);
  const sessionRef = useRef(session);
  const presentationIdRef = useRef("");
  const journaledSession = useRef<ReadingSession | null>(null);
  const requestedHint = useRef<{
    session: ReadingSession;
    noteId: string;
    level: ReadingHintLevel;
  } | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    session?.configure(saved.preferences);
  }, [session, saved.preferences]);
  const publish = useCallback(() => {
    if (!session) return;
    const snapshot = session.snapshot();
    setPublished((previous) =>
      previous?.session === session &&
      previous.snapshot.noteId === snapshot.noteId &&
      previous.snapshot.hintLevel === snapshot.hintLevel &&
      previous.snapshot.answers.length === snapshot.answers.length &&
      previous.snapshot.active === snapshot.active &&
      previous.snapshot.presented === snapshot.presented
        ? previous
        : { session, snapshot }
    );
  }, [session]);
  const snapshot = published?.session === session ? published.snapshot : session?.snapshot();
  const index = exercise
    ? Math.max(
        0,
        exercise.song.notes.findIndex((note) => note.id === snapshot?.noteId)
      )
    : 0;
  const note = exercise?.song.notes[index];
  const prompt = useMemo(
    () => (exercise ? readingPromptXml(exercise.musicXml, exercise.task, index) : null),
    [exercise, index]
  );
  const noteId = snapshot?.noteId;
  const id = exercise
    ? `${run?.runId ?? ""}:${exercise.id}:${noteId ?? "preparing"}:${String(retry)}`
    : "";
  useEffect(() => {
    presentationIdRef.current = id;
  }, [id]);
  const renderError = errorId === id;
  useEffect(() => {
    errorRef.current = renderError;
  }, [renderError]);
  const hintLevel = renderedHint?.id === id ? renderedHint.level : 0;
  const requestHint = useCallback(
    (level: ReadingHintLevel, noteId: string) => {
      if (!session) return;
      const previousRequest = requestedHint.current;
      const requested =
        previousRequest?.session === session && previousRequest.noteId === noteId
          ? (Math.max(level, previousRequest.level) as ReadingHintLevel)
          : level;
      requestedHint.current = { session, noteId, level: requested };
      const target = `${run?.runId ?? ""}:${exercise?.id ?? ""}:${noteId}:${String(retry)}`;
      setRenderedHint((previous) =>
        previous?.id === target && previous.level >= level ? previous : { id: target, level }
      );
    },
    [session, exercise, retry, run]
  );

  const policy = useMemo<TrainerReadingPolicy | null>(
    () =>
      session
        ? {
            onFrame(practice, playing, atMs) {
              const due = practice.nextDue()[0];
              if (due && practice.waiting) session.prepare(due.id, due.pitch, atMs);
              session.setActive(
                playing &&
                  practice.waiting &&
                  !blockedRef.current &&
                  !errorRef.current &&
                  document.visibilityState !== "hidden",
                atMs
              );
              const wanted = session.suggestHint(atMs);
              const noteId = session.snapshot().noteId;
              if (wanted > session.snapshot().hintLevel && noteId) {
                requestHint(wanted, noteId);
              }
              publish();
            },
            allowInput(event, practice, raw) {
              const owed = practice.nextDue()[0];
              return Boolean(
                owed &&
                !blockedRef.current &&
                document.visibilityState !== "hidden" &&
                session.canAnswer(owed.id, raw)
              );
            },
            onJudgement(event, events, raw) {
              if (events.some((event) => event.type === "hit" || event.type === "wrong")) {
                session.answer(event.pitch, event.source ?? "pointer", raw);
                publish();
              }
            },
            cuePitch() {
              const state = session.snapshot();
              return state.active &&
                state.presented &&
                (state.hintLevel === 2 ||
                  (requestedHint.current?.session === session &&
                    requestedHint.current.noteId === state.noteId &&
                    requestedHint.current.level === 2)) &&
                document.visibilityState !== "hidden" &&
                exercise?.task !== "check"
                ? exercise?.song.notes.find((note) => note.id === state.noteId)?.pitch
                : undefined;
            },
            onCuePresented(pitch, atMs) {
              const state = session.snapshot();
              if (
                state.noteId &&
                exercise?.song.notes.find((note) => note.id === state.noteId)?.pitch === pitch
              ) {
                session.showHint(state.noteId, 2, atMs);
                publish();
              }
            }
          }
        : null,
    [session, exercise, publish, requestHint]
  );

  const presentation = useMemo(
    () =>
      session
        ? {
            id,
            onPresented(shownId: string, atMs: number) {
              if (
                shownId !== id ||
                presentationIdRef.current !== shownId ||
                sessionRef.current !== session ||
                !noteId
              )
                return;
              session.present(noteId, atMs);
              if (!session.snapshot().presented) return;
              session.markStarted(Date.now());
              if (exercise && journaledSession.current !== session) {
                journaledSession.current = session;
                void store.claimReadingMaterial(readingFingerprint(exercise)).then((fresh) => {
                  if (sessionRef.current === session) {
                    session.confirmNewMaterial(fresh && exercise.task === "check");
                  }
                });
              }
              publish();
            },
            onError(shownId: string) {
              if (
                shownId === id &&
                presentationIdRef.current === shownId &&
                sessionRef.current === session
              ) {
                setErrorId(id);
                session.setActive(false, performance.now());
                publish();
              }
            }
          }
        : undefined,
    [session, id, noteId, publish, exercise, store]
  );

  useEffect(() => {
    if (!session || hintLevel === 0 || !snapshot?.noteId || !snapshot.presented) return;
    const frame = requestAnimationFrame((atMs) => {
      if (sessionRef.current === session && document.visibilityState !== "hidden") {
        session.showHint(snapshot.noteId ?? "", 1, atMs);
        publish();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [session, hintLevel, snapshot?.noteId, snapshot?.active, snapshot?.presented, publish]);

  const onSelected = useCallback(() => {
    setIntro(false);
    refreshClock();
  }, [refreshClock]);
  const generation = useReadingGeneration(onSelected);
  const finish = useCallback(() => {
    if (!session || finished?.session === session) return;
    const result = session.result(crypto.randomUUID(), Date.now());
    if (result) {
      dispatch(readingActions.resultAdded(result));
      setFinished({ session, result });
    }
  }, [session, finished, dispatch]);
  const suspend = useCallback(() => {
    session?.setActive(false, performance.now());
    publish();
  }, [session, publish]);
  return {
    active: exercise !== null,
    task: exercise?.task ?? null,
    purpose: saved.plan?.purpose ?? saved.task,
    profile: saved.profile,
    sourceFilter: saved.sourceFilter,
    delayedDue: saved.profile.delayedDueAt !== null && wallNow >= saved.profile.delayedDueAt,
    refreshClock,
    exercise,
    session,
    policy,
    snapshot,
    index,
    prompt,
    presentation,
    retry,
    renderError,
    hintLevel,
    note,
    preferences: saved.preferences,
    history: saved.history,
    result: finished?.session === session ? finished.result : null,
    intro,
    setIntro,
    blockedRef,
    ...generation,
    exit: () => dispatch(readingActions.exit()),
    finish,
    suspend,
    newSeries: () => {
      if (saved.task) void generation.select(saved.plan?.purpose ?? saved.task);
    },
    onRetry: () => {
      if (snapshot?.noteId) session?.requirePresentation(snapshot.noteId, performance.now());
      publish();
      setRetry((value) => value + 1);
      setErrorId(null);
    },
    hint: () => {
      if (
        session &&
        snapshot?.presented &&
        snapshot.active &&
        snapshot.noteId &&
        saved.task !== "check"
      )
        requestHint(
          Math.min(2, Math.max(hintLevel, snapshot.hintLevel) + 1) as ReadingHintLevel,
          snapshot.noteId
        );
    },
    updatePreferences: (value: Partial<ReadingPreferences>) =>
      dispatch(readingActions.preferencesChanged(value))
  };
}

export function useReadingTrainer(
  reading: {
    policy: TrainerReadingPolicy | null;
    session: { setActive: (active: boolean, atMs: number) => void } | null;
    blockedRef: RefObject<boolean>;
    suspend: () => void;
  },
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean
) {
  const { policy, session, blockedRef, suspend } = reading;
  useEffect(() => {
    blockedRef.current = blocked;
    if (blocked) suspend();
  }, [blocked, blockedRef, suspend]);
  useEffect(() => {
    if (!ready) return;
    const trainer = trainerRef.current;
    trainer?.configureReading(policy);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") suspend();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      trainer?.configureReading(null);
      document.removeEventListener("visibilitychange", onVisibility);
      session?.setActive(false, performance.now());
    };
  }, [trainerRef, ready, policy, session, suspend]);
}
