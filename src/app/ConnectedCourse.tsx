import { shallowEqual } from "react-redux";
import { phraseCompleted, stageCompleted, nextSelection } from "../course/model";
import { CourseCards } from "../ui/CourseCards";
import { CourseLessonBar } from "../ui/CourseLessonBar";
import { PianoTabs } from "../ui/PianoTabs";
import { COURSE_LESSONS } from "./courseCatalog";
import { useAppSelector } from "./storeHooks";
import { useRuntimeCommand } from "./runtimeCommands";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useTrainerSelector } from "./trainerSnapshots";
import { useI18n } from "./useI18n";

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
    current: current === lesson.id,
    started: lesson.stages.some((stage) =>
      lesson.phrases.some((phrase) => phraseCompleted(lesson, stage, phrase, progress))
    ),
    stages: lesson.stages.map((id) => ({ id, completed: stageCompleted(lesson, id, progress) }))
  }));
  return (
    <CourseCards
      lessons={lessons}
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
  const { active, view, progress } = useRuntimeSelector(
    (runtime) => ({
      active: runtime.course.active,
      view: runtime.course.saved.view,
      progress: runtime.course.saved.progress
    }),
    shallowEqual
  );
  const open = useRuntimeCommand((runtime) => runtime.course.controller.open);
  const chooseStage = useRuntimeCommand((runtime) => runtime.course.controller.chooseStage);
  const setView = useRuntimeCommand((runtime) => runtime.course.setView);
  const setResultClosed = useRuntimeCommand((runtime) => runtime.setResultClosed);
  if (!active) return null;
  const { lesson, phrase, selection } = active;
  const next = nextSelection(lesson, selection);
  const completed = phraseCompleted(lesson, selection.stage, phrase, progress);
  return (
    <CourseLessonBar
      title={lesson.title}
      stages={lesson.stages.map((id) => ({ id, completed: stageCompleted(lesson, id, progress) }))}
      currentStage={selection.stage}
      phrases={lesson.phrases.map((item) => ({
        id: item.id,
        completed: phraseCompleted(lesson, selection.stage, item, progress)
      }))}
      phraseId={phrase.id}
      view={view}
      completed={completed}
      onStage={(stage) => {
        chooseStage(lesson.id, stage);
      }}
      onPhrase={(phraseId) => {
        open({ ...selection, phraseId });
      }}
      onView={setView}
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
  const { song, source, stage } = useRuntimeSelector(
    (runtime) => ({
      song: runtime.song,
      source: runtime.trainer.snapshotSource,
      stage: runtime.course.active?.selection.stage
    }),
    shallowEqual
  );
  const time = useTrainerSelector(source, (snapshot) => snapshot?.time ?? -2);
  return stage ? <PianoTabs song={song} time={time} stage={stage} /> : null;
}
