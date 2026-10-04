import type { ReactNode } from "react";

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
