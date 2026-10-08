import { useI18n } from "../app/useI18n";

export type CourseStageId = "right" | "left" | "both";

export interface CourseStageModel {
  readonly id: CourseStageId;
  readonly completed: boolean;
}

export interface CourseCardModel {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly goal: string;
  readonly ready: boolean;
  readonly current?: boolean;
  readonly started: boolean;
  readonly stages: readonly CourseStageModel[];
}

export const COURSE_STAGE_LABELS = { right: "Правая", left: "Левая", both: "Обе" } as const;

interface Props {
  readonly lessons: readonly CourseCardModel[];
  readonly onContinue: (lessonId: string) => void;
  readonly onStage: (lessonId: string, stage: CourseStageId) => void;
}

/** Course cards receive stable summaries, independently of the practice clock. */
export function CourseCards({ lessons, onContinue, onStage }: Props) {
  const { t } = useI18n();
  const completed = lessons.filter(
    (lesson) =>
      lesson.ready && lesson.stages.length > 0 && lesson.stages.every((stage) => stage.completed)
  ).length;
  return (
    <section className="course" aria-label={t("Первые 10 уроков")}>
      <div className="course-heading">
        <h3>{t("Первые 10 уроков")}</h3>
        <span>
          {t("Пройдено уроков: {done} из {total}", { done: completed, total: lessons.length })}
        </span>
      </div>
      <div className="course-grid">
        {lessons.map((lesson) => {
          const done = lesson.stages.filter((stage) => stage.completed).length;
          const finished =
            lesson.ready && lesson.stages.length > 0 && done === lesson.stages.length;
          return (
            <article
              key={lesson.id}
              className="course-card"
              data-current={lesson.current}
              data-ready={lesson.ready}
            >
              <div className="course-card__heading">
                <span
                  className="course-card__number"
                  aria-label={t("Урок {number}", { number: lesson.number })}
                >
                  {String(lesson.number).padStart(2, "0")}
                </span>
                <strong>{t(lesson.title)}</strong>
              </div>
              <p>{t(lesson.goal)}</p>
              <div className="course-stages" aria-label={t("Этапы урока")}>
                {lesson.stages.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    className="level-chip"
                    data-completed={stage.completed}
                    disabled={!lesson.ready}
                    onClick={() => {
                      onStage(lesson.id, stage.id);
                    }}
                    aria-label={t("{stage}: {status}", {
                      stage: t(COURSE_STAGE_LABELS[stage.id]),
                      status: stage.completed ? t("Этап пройден") : t("Этап не пройден")
                    })}
                  >
                    <span aria-hidden="true">{stage.completed ? "✓ " : "○ "}</span>
                    {t(COURSE_STAGE_LABELS[stage.id])}
                  </button>
                ))}
              </div>
              <div className="course-card__footer">
                <span>{t("Этапы: {done} из {total}", { done, total: lesson.stages.length })}</span>
                <button
                  type="button"
                  className="game-button"
                  disabled={!lesson.ready}
                  onClick={() => {
                    onContinue(lesson.id);
                  }}
                >
                  {!lesson.ready
                    ? t("Скоро")
                    : finished
                      ? t("Повторить")
                      : lesson.started
                        ? t("Продолжить")
                        : t("Начать")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
