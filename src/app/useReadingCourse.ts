import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateReadingExercise, nextReadingSeed } from "../reading/generator";
import { readingPromptXml } from "../reading/prompt";
import { ReadingSession } from "../reading/session";
import { DEFAULT_READING_PREFERENCES } from "../reading/types";
import type {
  ReadingHintLevel,
  ReadingPreferences,
  ReadingResult,
  ReadingTask
} from "../reading/types";
import type { TrainerReadingPolicy } from "../practice/readingPolicy";
import type { Trainer } from "../practice/Trainer";
import type { RefObject } from "react";
import { readingActions } from "./readingSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";

export function useReadingCourse() {
  const saved = useAppSelector((state) => state.reading);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [intro, setIntro] = useState(false);
  const [retry, setRetry] = useState(0);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [renderedHint, setRenderedHint] = useState<{ id: string; level: ReadingHintLevel } | null>(
    null
  );
  const exercise = useMemo(
    () => (saved.task ? generateReadingExercise(saved.task, saved.seed) : null),
    [saved.task, saved.seed]
  );
  const session = useMemo(
    () => (exercise ? new ReadingSession(exercise, DEFAULT_READING_PREFERENCES) : null),
    [exercise]
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
  const id = exercise ? `${exercise.id}:${noteId ?? "preparing"}:${String(retry)}` : "";
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
      const target = `${exercise?.id ?? ""}:${noteId}:${String(retry)}`;
      setRenderedHint((previous) =>
        previous?.id === target && previous.level >= level ? previous : { id: target, level }
      );
    },
    [session, exercise, retry]
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
    [session, id, noteId, publish]
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

  const start = useCallback(
    (task: ReadingTask) => {
      const state = store.getState().reading;
      dispatch(readingActions.select({ task, seed: nextReadingSeed(state.seed, task) }));
      setIntro(false);
    },
    [store, dispatch]
  );
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
    task: saved.task,
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
    start,
    exit: () => dispatch(readingActions.exit()),
    finish,
    suspend,
    newSeries: () => {
      if (saved.task) start(saved.task);
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
  reading: ReturnType<typeof useReadingCourse>,
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
