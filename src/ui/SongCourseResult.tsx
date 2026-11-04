import type { SongCourseResult as CourseResult } from "../songCourse/model";
import { useI18n } from "../app/useI18n";
import assistant from "./lesson-art/assistant.webp";

export interface SongCourseResultProps {
  readonly result: CourseResult;
  readonly hasNext: boolean;
  readonly canReview: boolean;
  readonly storageError: boolean;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onReview: () => void;
  readonly onExit: () => void;
  readonly onRetrySave: () => void;
}

export function SongCourseResult(props: SongCourseResultProps) {
  const { t } = useI18n();
  const { result } = props;
  const passed = result.valid && result.completed;
  const primary =
    passed && props.hasNext ? props.onNext : props.canReview ? props.onReview : props.onRetry;
  const label =
    passed && props.hasNext
      ? "К следующему этапу"
      : props.canReview
        ? "Разобрать трудные места"
        : "Сыграть этот этап ещё раз";
  const axes = [
    { label: "Правильные ноты", value: result.pitch },
    { label: "Попадание в ритм", value: result.onset },
    { label: "Длина нажатия", value: result.hold }
  ] as const;
  return (
    <section
      className="song-course-result"
      aria-labelledby="song-course-result-title"
      role="region"
    >
      <div className="song-course-result__celebration" aria-hidden="true">
        <span>✦</span>
        <span>✦</span>
        <span>✦</span>
      </div>
      <div
        className="song-course-result__stars"
        role="img"
        aria-label={t("Звёзд за этап: {count} из 3", { count: result.valid ? result.stars : 0 })}
      >
        {[1, 2, 3].map((star) => (
          <span key={star} data-earned={result.valid && result.stars >= star} aria-hidden="true">
            ★
          </span>
        ))}
      </div>
      <h2 id="song-course-result-title">
        {t(
          !result.valid
            ? "Попытка не завершена"
            : passed
              ? "Этап сыгран!"
              : "Потренируем трудные места"
        )}
      </h2>
      <p className="song-course-result__message">
        {t(
          passed
            ? "Получилось! Следующая часть уже ждёт."
            : "Каждая попытка помогает. Повторим сложные фразы."
        )}
      </p>
      <dl className="song-course-result__axes">
        {axes.map((axis) => (
          <div key={axis.label}>
            <dt>{t(axis.label)}</dt>
            <dd>
              {axis.value === null
                ? t("Время начала не оценивается")
                : t("{value} процентов", { value: Math.round(axis.value) })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="song-course-result__speed">
        {t("Скорость исполнения: {value}%", { value: Math.round(result.speed * 100) })}
      </p>
      {props.storageError && (
        <div role="alert" className="song-course-error">
          <p>{t("Результат пока не сохранён. Он остаётся на экране.")}</p>
          <button type="button" className="game-button" onClick={props.onRetrySave}>
            {t("Ещё раз сохранить результат")}
          </button>
        </div>
      )}
      <div className="song-course-result__actions">
        <button type="button" className="game-button song-course-primary" onClick={primary}>
          {t(label)}
        </button>
        {props.canReview && primary !== props.onReview && (
          <button type="button" className="game-button" onClick={props.onReview}>
            {t("Разобрать трудные места")}
          </button>
        )}
        {primary !== props.onRetry && (
          <button type="button" className="game-button" onClick={props.onRetry}>
            {t("Сыграть этот этап ещё раз")}
          </button>
        )}
        <button
          type="button"
          className="game-button song-course-result__exit"
          onClick={props.onExit}
        >
          {t("К пути по мелодиям")}
        </button>
      </div>
      <img className="song-course-result__assistant" src={assistant} alt="" draggable={false} />
    </section>
  );
}
