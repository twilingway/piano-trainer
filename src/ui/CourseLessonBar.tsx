import { useI18n } from "../app/useI18n";

interface Props {
  readonly title: string;
  readonly phrases: readonly {
    readonly id: string;
    readonly title?: string;
    readonly completed: boolean;
  }[];
  readonly phraseId: string;
  readonly completed: boolean;
  readonly nextLabel?: string;
  readonly onPhrase: (phraseId: string) => void;
  readonly onNext?: () => void;
}

/** Compact phrase navigation for the main toolbar and its mobile menu. */
export function CourseLessonBar(props: Props) {
  const { t, formatNumber } = useI18n();
  const phraseIndex = props.phrases.findIndex((phrase) => phrase.id === props.phraseId);
  const position = t("Фраза {number} из {total}", {
    number: phraseIndex + 1,
    total: props.phrases.length
  });
  const nextLabel = props.nextLabel ? t(props.nextLabel) : t("Следующее задание");
  return (
    <div className="course-lesson-bar" role="group" aria-label={t(props.title)}>
      <label className="course-phrase-choice">
        <span className="course-phrase-position" title={position}>
          <span className="course-phrase-position__full">{position}</span>
          <span className="course-phrase-position__short" aria-hidden="true">
            {formatNumber(phraseIndex + 1)}/{formatNumber(props.phrases.length)}
          </span>
        </span>
        <select
          className="game-select"
          aria-label={t("Выбрать фразу")}
          value={props.phraseId}
          onChange={(event) => {
            props.onPhrase(event.target.value);
          }}
        >
          {props.phrases.map((phrase, index) => (
            <option key={phrase.id} value={phrase.id}>
              {phrase.title ? t(phrase.title) : t("Фраза {number}", { number: index + 1 })}
              {phrase.completed ? " ✓" : ""}
            </option>
          ))}
        </select>
      </label>
      {props.completed && (
        <span
          className="course-completed"
          role="status"
          title={t("Фраза пройдена")}
          aria-label={t("Фраза пройдена")}
        >
          <span className="course-completed__label">{t("Фраза пройдена")}</span>
          <span aria-hidden="true">✓</span>
        </span>
      )}
      {props.completed && props.onNext && (
        <button
          type="button"
          className="game-button course-next"
          onClick={props.onNext}
          aria-label={nextLabel}
          title={nextLabel}
        >
          <span className="course-next__label">{nextLabel}</span>
          <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}
