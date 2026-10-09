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

/** Task navigation stays separate from the main hands and view controls. */
export function CourseLessonBar(props: Props) {
  const { t } = useI18n();
  const phraseIndex = props.phrases.findIndex((phrase) => phrase.id === props.phraseId);
  return (
    <div className="course-lesson-bar">
      <strong title={t(props.title)}>{t(props.title)}</strong>
      <label className="course-phrase-choice">
        <span>
          {t("Фраза {number} из {total}", { number: phraseIndex + 1, total: props.phrases.length })}
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
