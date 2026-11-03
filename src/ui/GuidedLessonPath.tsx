import { useI18n } from "../app/useI18n";
import { lessonPath, type PathStep } from "../learningPath/model";
import assistant from "./lesson-art/assistant.webp";
export function GuidedLessonPath({
  completed,
  onChoose,
  error,
  pending
}: {
  readonly completed: readonly string[];
  readonly onChoose: (step: PathStep) => void;
  readonly error?: string | null;
  readonly pending?: boolean;
}) {
  const { t } = useI18n();
  const path = lessonPath(completed);
  return (
    <section className="guided-path" aria-label={t("Первые шаги")}>
      <header className="guided-path__heading">
        <span className="guided-path__eyebrow">{t("ВАШ МУЗЫКАЛЬНЫЙ ПУТЬ")}</span>
        <h3>{t("Одна нота. Один шаг. Уже музыка.")}</h3>
        <p>{t("Короткие задания от первой клавиши к игре двумя руками.")}</p>
      </header>
      <div className="guided-path__welcome">
        <div className="guided-path__speech">
          <span className="guided-path__eyebrow">
            {t(path.next ? "ВАШ СЛЕДУЮЩИЙ ШАГ" : "ПУТЬ ПРОЙДЕН")}
          </span>
          <h4>{t(path.next?.title ?? "Вы прошли все шаги!")}</h4>
          <p>{t(path.next?.goal ?? "Возвращайтесь к любому заданию и пробуйте новые серии.")}</p>
          {path.next && (
            <button
              type="button"
              className="game-button guided-path__continue"
              disabled={pending}
              onClick={() => {
                if (path.next) onChoose(path.next);
              }}
            >
              {t(
                pending
                  ? "Готовим задание…"
                  : path.completedCount
                    ? "Продолжить путь"
                    : "Начать первый шаг"
              )}
              <span aria-hidden="true"> →</span>
            </button>
          )}
        </div>
        <img
          className="guided-path__assistant"
          src={assistant}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      </div>
      {error && (
        <p role="alert" className="guided-path__error">
          {t(error)}
        </p>
      )}
      <div className="guided-path__progress">
        <span>
          {t("Выполнено шагов: {completed} из {total}", {
            completed: path.completedCount,
            total: path.steps.length
          })}
        </span>
        <progress
          value={path.completedCount}
          max={path.steps.length}
          aria-label={t("Пройденные шаги маршрута")}
        />
      </div>
      <p className="guided-path__freedom">
        {t("Идите по порядку или выбирайте любой шаг. Все задания открыты.")}
      </p>
      <ol className="guided-path__trail">
        {path.steps.map((step, index) => (
          <li key={step.id} className="guided-path__item" data-status={step.status}>
            {(index === 0 || path.steps[index - 1]?.chapter !== step.chapter) && (
              <h4 className="guided-path__chapter">{t(step.chapter)}</h4>
            )}
            <button
              type="button"
              className="guided-path__step"
              aria-current={step.status === "current" ? "step" : undefined}
              disabled={pending}
              onClick={() => {
                onChoose(step);
              }}
            >
              <span className="guided-path__token" aria-hidden="true">
                {step.status === "completed" ? "✓" : step.symbol}
              </span>
              <span className="guided-path__description">
                <span className="guided-path__status">
                  {t(
                    step.status === "completed"
                      ? "Выполнено"
                      : step.status === "current"
                        ? "Сейчас"
                        : "Впереди"
                  )}
                  {" · "}
                  {t("Шаг {number}", { number: index + 1 })}
                </span>
                <strong>{t(step.title)}</strong>
                <span className="guided-path__goal">{t(step.goal)}</span>
                {step.command.kind === "music" && (
                  <span className="guided-path__choice">{t("Выбрать задание →")}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
