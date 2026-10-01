import type { ReactNode } from "react";

import type { KeyRange } from "../../app/useFallingView";
import type { KeyStyle } from "../../render/KeyboardLayer";

interface Props {
  readonly keyRange: KeyRange;
  readonly onKeyRange: (range: KeyRange) => void;
  readonly showLabels: boolean;
  readonly onShowLabels: (show: boolean) => void;
  readonly keyStyle: KeyStyle;
  readonly onKeyStyle: (style: KeyStyle) => void;
  /** The view toggles, the same as on the bar. */
  readonly toggles: ReactNode;
}

/** The keyboard tab: how many keys, the stickers and what to show. */
export function KeyboardSettings({
  keyRange,
  onKeyRange,
  showLabels,
  onShowLabels,
  keyStyle,
  onKeyStyle,
  toggles
}: Props) {
  return (
    <div className="settings-list">
      <label className="setting">
        <span>Клавиши</span>
        <select
          className="game-select"
          value={keyRange}
          onChange={(event) => {
            onKeyRange(event.target.value as KeyRange);
          }}
        >
          <option value="song">По песне</option>
          <option value="88">88 клавиш</option>
          <option value="61">61 клавиша</option>
          <option value="49">49 клавиш</option>
        </select>
      </label>
      <label className="setting">
        <span>Вид клавиш</span>
        <select
          className="game-select"
          value={keyStyle}
          onChange={(event) => {
            onKeyStyle(event.target.value as KeyStyle);
          }}
        >
          <option value="classic">Классика</option>
          <option value="arcade">Аркада</option>
        </select>
      </label>
      <label className="setting">
        <span>Наклейки с названиями на клавишах</span>
        <input
          type="checkbox"
          checked={showLabels}
          onChange={(event) => {
            onShowLabels(event.target.checked);
          }}
        />
      </label>
      <div className="setting">
        <span>Что показывать</span>
        <span className="setting-control">{toggles}</span>
      </div>
    </div>
  );
}
