import type { Language, Part } from "../wordTyping/types";

interface Props {
  readonly language: Language;
  readonly part: Part;
  readonly accompaniment: boolean;
  readonly locked: boolean;
  readonly onLanguage: (language: Language) => void;
  readonly onPart: (part: Part) => void;
  readonly onAccompaniment: (on: boolean) => void;
}

export function WordTypingSettings(props: Props) {
  return (
    <div className="word-options">
      <label>
        Язык текста
        <select
          className="game-select"
          aria-label="Язык текста"
          value={props.language}
          disabled={props.locked}
          onChange={(event) => {
            props.onLanguage(event.target.value as Language);
          }}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        Партия
        <select
          className="game-select"
          aria-label="Партия для печати"
          value={props.part}
          disabled={props.locked}
          onChange={(event) => {
            props.onPart(event.target.value as Part);
          }}
        >
          <option value="melody">Мелодия</option>
          <option value="bass">Бас</option>
        </select>
      </label>
      <label title="Вторая рука песни играет сама под печатаемую партию">
        <input
          type="checkbox"
          checked={props.accompaniment}
          disabled={props.locked}
          onChange={(event) => {
            props.onAccompaniment(event.target.checked);
          }}
        />
        Аккомпанемент второй руки
      </label>
    </div>
  );
}
