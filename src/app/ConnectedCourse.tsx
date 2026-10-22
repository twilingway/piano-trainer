import { shallowEqual } from "react-redux";
import {
  phraseCompleted,
  stageCompleted,
  stageProgress,
  blockingLessonNumber,
  nextSelection,
  stagePhrases
} from "../course/model";
import { CourseCards } from "../ui/CourseCards";
import { CourseLessonBar } from "../ui/CourseLessonBar";
import { PianoTabs } from "../ui/PianoTabs";
import { COURSE_ACCESS_MODE, COURSE_LESSONS } from "./courseCatalog";
import { useAppSelector } from "./storeHooks";
import { useRuntimeCommand } from "./runtimeCommands";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useTrainerSelector } from "./trainerSnapshots";
import { useI18n } from "./useI18n";
import { NOTE_RESULT_POLICY } from "../practice/noteResult";

export function ConnectedCourseCards({ onChoose }: { onChoose: () => void }) {
  const { t } = useI18n();
  const progress = useAppSelector((state) => state.course.progress);
  const current = useRuntimeSelector((runtime) => runtime.course.active?.lesson.id);
  const continueLesson = useRuntimeCommand((runtime) => runtime.course.controller.continueLesson);
  const chooseStage = useRuntimeCommand((runtime) => runtime.course.controller.chooseStage);
  const lessons = COURSE_LESSONS.map((lesson) => ({
    id: lesson.id,
    number: lesson.number,
    title: t(lesson.title, { number: lesson.number }),
    goal: t(lesson.goal),
    ready: lesson.phrases.length > 0,
    lockedBy:
      blockingLessonNumber(lesson, COURSE_LESSONS, progress, COURSE_ACCESS_MODE) ?? undefined,
    current: current === lesson.id,
    started: lesson.stages.some((stage) =>
      stagePhrases(lesson, stage).some((phrase) => phraseCompleted(lesson, stage, phrase, progress))
    ),
    stages: lesson.stages.map((id) => ({
      id,
      completed: stageCompleted(lesson, id, progress),
      ...stageProgress(lesson, id, progress)
    }))
  }));
  return (
    <CourseCards
      lessons={lessons}
      previousCredits={Object.keys(progress).some((key) => !key.includes(NOTE_RESULT_POLICY))}
      onContinue={(id) => {
        continueLesson(id);
        onChoose();
      }}
      onStage={(id, stage) => {
        chooseStage(id, stage);
        onChoose();
      }}
    />
  );
}

export function ConnectedCourseLessonBar() {
  const { active, progress } = useRuntimeSelector(
    (runtime) => ({
      active: runtime.course.active,
      progress: runtime.course.saved.progress
    }),
    shallowEqual
  );
  const open = useRuntimeCommand((runtime) => runtime.course.controller.open);
  const setResultClosed = useRuntimeCommand((runtime) => runtime.setResultClosed);
  if (!active) return null;
  const { lesson, phrase, selection } = active;
  const next = nextSelection(lesson, selection);
  const completed = phraseCompleted(lesson, selection.stage, phrase, progress);
  return (
    <CourseLessonBar
      title={lesson.title}
      phrases={stagePhrases(lesson, selection.stage).map((item) => ({
        id: item.id,
        ...(item.title ? { title: item.title } : {}),
        completed: phraseCompleted(lesson, selection.stage, item, progress)
      }))}
      phraseId={phrase.id}
      completed={completed}
      onPhrase={(phraseId) => {
        open({ ...selection, phraseId });
      }}
      {...(next
        ? {
            onNext: () => {
              setResultClosed(true);
              open(next);
            }
          }
        : {})}
    />
  );
}

export function ConnectedPianoTabs() {
  const { song, baseSong, source, stage } = useRuntimeSelector(
    (runtime) => ({
      song: runtime.song,
      baseSong: runtime.current.baseSong,
      source: runtime.trainer.snapshotSource,
      stage: runtime.course.active?.selection.stage
    }),
    shallowEqual
  );
  const time = useTrainerSelector(source, (snapshot) => snapshot?.time ?? -2);
  const prefs = useAppSelector((state) => state.preferences.staff);
  const liveBeat = useRuntimeCommand((runtime) => runtime.trainer.liveBeat);
  return stage ? (
    <PianoTabs
      song={song}
      baseSong={baseSong}
      time={time}
      liveBeat={liveBeat}
      stage={stage}
      prefs={prefs}
    />
  ) : null;
}
