import type { SongCourseResult as CourseResult } from "../songCourse/model";
import { useI18n } from "../app/useI18n";
import { ClayStars } from "./ClayStars";
import assistant from "./lesson-art/assistant.webp";

export interface SongCourseResultProps {
  readonly result: CourseResult;
  readonly introductory?: boolean;
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
  const canReview = props.canReview && !props.introductory;
  const primary =
    passed && props.hasNext ? props.onNext : canReview ? props.onReview : props.onRetry;
  const label =
    passed && props.hasNext
      ? "К следующему этапу"
      : canReview
        ? "Разобрать трудные места"
        : "Сыграть ещё раз";
  const axes = [
    {
      label: "Правильные ноты",
      value: result.pitch,
      tip: "Повторим нужные клавиши, затем сыграем ещё раз."
    },
    {
      label: props.introductory ? "Начал вовремя" : "Попадание в ритм",
      value: result.onset,
      tip: "Послушаем ритм и попробуем нажимать вовремя."
    },
    {
      label: "Длина нажатия",
      value: result.hold,
      tip: "Держите клавишу до конца ноты, затем отпускайте."
    }
  ] as const;
  const weakest = axes
    .filter((axis) => axis.value !== null)
    .reduce((a, b) => ((a.value ?? Infinity) <= (b.value ?? Infinity) ? a : b));
  const stars = result.valid ? result.stars : 0;
  return (
    <section
      className="song-course-result"
      aria-labelledby="song-course-result-title"
      role="region"
    >
      <header className="song-course-result__bar">
        <button
          type="button"
          className="game-button song-course-lesson__icon"
          aria-label={t("К пути по мелодиям")}
          title={t("К пути по мелодиям")}
          onClick={props.onExit}
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="song-course-result__rating">
          {t("Звёзд за этап: {count} из 3", { count: stars })}
        </p>
        <span aria-hidden="true" />
      </header>
      <div className="song-course-result__body" tabIndex={0}>
        <div className="song-course-result__celebration" aria-hidden="true">
          <span>✦</span>
          <span>✦</span>
          <span>✦</span>
        </div>
        <div
          className="song-course-result__stars"
          role="img"
          aria-label={t("Звёзд за этап: {count} из 3", { count: stars })}
        >
          <ClayStars count={stars} />
        </div>
        <h2 id="song-course-result-title">
          {t(
            !result.valid
              ? "Попытка не завершена"
              : passed
                ? "Этап сыгран!"
                : props.introductory
                  ? "Попробуем ещё раз"
                  : "Потренируем трудные места"
          )}
        </h2>
        <p className="song-course-result__message">
          {t(
            passed
              ? "Получилось! Следующая часть уже ждёт."
              : result.valid
                ? weakest.tip
                : "Каждая попытка помогает. Повторим сложные фразы."
          )}
        </p>
        <dl className="song-course-result__axes">
          {axes
            .filter((axis) => axis.value !== null)
            .map((axis) => (
              <div key={axis.label}>
                <dt>{t(axis.label)}</dt>
                <dd>{t("{value} процентов", { value: Math.round(axis.value ?? 0) })}</dd>
              </div>
            ))}
        </dl>
        {result.mode === "tempo" && (
          <p className="song-course-result__speed">
            {t("Скорость исполнения: {value}%", { value: Math.round(result.speed * 100) })}
          </p>
        )}
        {props.storageError && (
          <div role="alert" className="song-course-error">
            <p>{t("Результат пока не сохранён. Он остаётся на экране.")}</p>
            <button type="button" className="game-button" onClick={props.onRetrySave}>
              {t("Ещё раз сохранить результат")}
            </button>
          </div>
        )}
      </div>
      <div className="song-course-result__actions">
        <button type="button" className="game-button song-course-primary" onClick={primary}>
          {t(label)}
        </button>
        {canReview && primary !== props.onReview && (
          <button type="button" className="game-button" onClick={props.onReview}>
            {t("Разобрать трудные места")}
          </button>
        )}
        {primary !== props.onRetry && (
          <button type="button" className="game-button" onClick={props.onRetry}>
            {t("Сыграть ещё раз")}
          </button>
        )}
      </div>
      <img className="song-course-result__assistant" src={assistant} alt="" draggable={false} />
    </section>
  );
}
