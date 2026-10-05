import type { ReactNode } from "react";
import { KeyboardIcon, TypingIcon } from "./icons";

interface Props {
  readonly wordTyping: boolean;
  readonly locked: boolean;
  readonly onChange: (wordTyping: boolean) => void;
  readonly children?: ReactNode;
}
export function GameModeSwitch(props: Props) {
  return (
    <div className="game-mode-strip">
      <label>
        Игра
        <select
          className="game-select"
          aria-label="Механика игры"
          value={props.wordTyping ? "word_typing" : "piano"}
          disabled={props.locked}
          onChange={(event) => {
            props.onChange(event.target.value === "word_typing");
          }}
        >
          <option value="piano">Пианино</option>
          <option value="word_typing">Печатать мелодию</option>
        </select>
      </label>
      {props.children}
    </div>
  );
}

const GAMES = [
  [false, "Пианино", KeyboardIcon],
  [true, "Печатать мелодию", TypingIcon]
] as const;

/** The bar's choice of game: two icons, the names in the tooltip. Buttons keep no typed letters. */
export function GameModeSegment(props: Omit<Props, "children">) {
  return (
    <div className="segmented game-mode-segment" role="radiogroup" aria-label="Игра">
      {GAMES.map(([wordTyping, label, Icon]) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={props.wordTyping === wordTyping}
          aria-label={label}
          title={props.locked ? `${label} — сменить игру можно на паузе` : label}
          disabled={props.locked}
          onClick={() => {
            if (props.wordTyping !== wordTyping) props.onChange(wordTyping);
          }}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
