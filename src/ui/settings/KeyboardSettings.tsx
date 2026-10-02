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
  /** The road's width at the horizon and the horizon's height, as shares. */
  readonly road: { readonly far: number; readonly horizon: number };
  readonly onRoad: (road: { far?: number; horizon?: number }) => void;
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
  road,
  onRoad,
  toggles
}: Props) {
  return (
    <div className="settings-list">
      <label className="setting">
        <span>Клавиши</span>
        <select
          className="game-select"
          aria-label="Клавиши"
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
        <span>Дорога: горизонт</span>
        <span className="setting-control">
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.01}
            value={road.horizon}
            onChange={(event) => {
              onRoad({ horizon: Number(event.target.value) });
            }}
          />
          <span className="digits">{Math.round(road.horizon * 100)}%</span>
        </span>
      </label>
      <label className="setting">
        <span>Дорога: ширина у горизонта</span>
        <span className="setting-control">
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.01}
            value={road.far}
            onChange={(event) => {
              onRoad({ far: Number(event.target.value) });
            }}
          />
          <span className="digits">{Math.round(road.far * 100)}%</span>
        </span>
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
      <div className="setting setting--views">
        <span>Что показывать</span>
        <span className="setting-control setting-control--views">{toggles}</span>
      </div>
    </div>
  );
}
