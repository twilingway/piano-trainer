import { useI18n } from "../app/useI18n";
import type { Language, Layout, Part } from "../wordTyping/types";

interface Props {
  readonly language: Language;
  readonly part: Part;
  readonly accompaniment: boolean;
  readonly layout: Layout;
  readonly locked: boolean;
  /** The words are being chosen. */
  readonly pending: boolean;
  readonly onLanguage: (language: Language) => void;
  readonly onPart: (part: Part) => void;
  readonly onAccompaniment: (on: boolean) => void;
  readonly onLayout: (layout: Layout) => void;
  readonly onRegenerate: () => void;
}

export function WordTypingSettings(props: Props) {
  const { t } = useI18n();
  return (
    <div className="word-options">
      <label>
        {t("Язык текста")}{" "}
        <select
          className="game-select"
          aria-label={t("Язык текста")}
          value={props.language}
          disabled={props.locked}
          onChange={(event) => {
            props.onLanguage(event.target.value as Language);
          }}
        >
          <option value="ru">{t("Русский")}</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        {t("Партия")}{" "}
        <select
          className="game-select"
          aria-label={t("Партия для печати")}
          value={props.part}
          disabled={props.locked}
          onChange={(event) => {
            props.onPart(event.target.value as Part);
          }}
        >
          <option value="melody">{t("Мелодия")}</option>
          <option value="bass">{t("Бас")}</option>
        </select>
      </label>
      <label
        title={t(
          "На слово: буква привязана к ноте только внутри слова, поэтому слова получаются длиннее"
        )}
      >
        {t("Раскладка")}{" "}
        <select
          className="game-select"
          aria-label={t("Раскладка букв")}
          value={props.layout}
          disabled={props.locked}
          onChange={(event) => {
            props.onLayout(event.target.value as Layout);
          }}
        >
          <option value="word">{t("На слово")}</option>
          <option value="song">{t("На песню")}</option>
        </select>
      </label>
      <button
        type="button"
        className="game-button"
        disabled={props.locked || props.pending}
        onClick={props.onRegenerate}
      >
        {t("Другие слова")}
      </button>
      <label title={t("Вторую руку играет программа, пока вы печатаете свою партию")}>
        <input
          type="checkbox"
          checked={props.accompaniment}
          disabled={props.locked}
          onChange={(event) => {
            props.onAccompaniment(event.target.checked);
          }}
        />
        {t("Аккомпанемент второй руки")}
      </label>
    </div>
  );
}
