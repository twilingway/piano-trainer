import { useI18n } from "../app/useI18n";
import { COURSE_STAGE_LABELS } from "./CourseCards";
import type { CourseStageId, CourseStageModel } from "./CourseCards";

interface Props {
  readonly title: string;
  readonly stages: readonly CourseStageModel[];
  readonly currentStage: CourseStageId;
  readonly phrases: readonly {
    readonly id: string;
    readonly title?: string;
    readonly completed: boolean;
  }[];
  readonly phraseId: string;
  readonly view: "tabs" | "staff";
  readonly completed: boolean;
  readonly nextLabel?: string;
  readonly onStage: (stage: CourseStageId) => void;
  readonly onPhrase: (phraseId: string) => void;
  readonly onView: (view: "tabs" | "staff") => void;
  readonly onNext?: () => void;
}

/** Selecting a view or a task is explicit; completion never starts the next task. */
export function CourseLessonBar(props: Props) {
  const { t } = useI18n();
  const phraseIndex = props.phrases.findIndex((phrase) => phrase.id === props.phraseId);
  return (
    <div className="course-lesson-bar">
      <strong>{t(props.title)}</strong>
      <div className="course-stages" aria-label={t("Этапы урока")}>
        {props.stages.map((stage) => (
          <button
            type="button"
            key={stage.id}
            className="level-chip"
            aria-pressed={props.currentStage === stage.id}
            data-completed={stage.completed}
            onClick={() => {
              props.onStage(stage.id);
            }}
          >
            {stage.completed && <span aria-hidden="true">✓ </span>}
            {t(COURSE_STAGE_LABELS[stage.id])}
          </button>
        ))}
      </div>
      <label className="course-phrase-choice">
        <span>
          {t("Фраза {number} из {total}", { number: phraseIndex + 1, total: props.phrases.length })}
        </span>
        <select
          aria-label={t("Выбрать фразу")}
          value={props.phraseId}
          onChange={(event) => {
            props.onPhrase(event.target.value);
          }}
        >
          {props.phrases.map((phrase, index) => (
            <option key={phrase.id} value={phrase.id}>
              {t("Фраза {number}", { number: index + 1 })}
              {phrase.title ? ` · ${t(phrase.title)}` : ""}
              {phrase.completed ? " ✓" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="course-view-choice" aria-label={t("Вид учебного задания")}>
        <button
          type="button"
          className="level-chip"
          aria-pressed={props.view === "tabs"}
          onClick={() => {
            props.onView("tabs");
          }}
        >
          {t("Табы")}
        </button>
        <button
          type="button"
          className="level-chip"
          aria-pressed={props.view === "staff"}
          onClick={() => {
            props.onView("staff");
          }}
        >
          {t("Ноты")}
        </button>
      </div>
      {props.completed && (
        <span className="course-completed" role="status">
          {t("Фраза пройдена")}
        </span>
      )}
      {props.completed && props.onNext && (
        <button type="button" className="game-button" onClick={props.onNext}>
          {props.nextLabel ? t(props.nextLabel) : t("Следующее задание")}
        </button>
      )}
    </div>
  );
}
