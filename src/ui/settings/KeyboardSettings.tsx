import { useI18n } from "../../app/useI18n";
import { CameraSettings } from "./CameraSettings";
import type { CameraPrefs } from "../../render/worldCamera";
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
  readonly road: { readonly far: number; readonly horizon: number };
  readonly onRoad: (road: { far?: number; horizon?: number }) => void;
  readonly camera: CameraPrefs;
  readonly onCamera: (camera: CameraPrefs) => void;
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
  camera,
  onCamera,
  road,
  onRoad,
  toggles
}: Props) {
  const { t } = useI18n();
  return (
    <div className="settings-list">
      <label className="setting">
        <span>{t("Клавиши")}</span>
        <select
          className="game-select"
          aria-label={t("Клавиши")}
          value={keyRange}
          onChange={(event) => {
            onKeyRange(event.target.value as KeyRange);
          }}
        >
          <option value="song">{t("По песне")}</option>
          <option value="3oct">{t("3 октавы")}</option>
          <option value="4oct">{t("4 октавы")}</option>
          <option value="88">{t("88 клавиш")}</option>
          <option value="61">{t("61 клавиша")}</option>
          <option value="49">{t("49 клавиш")}</option>
          <option value="25">{t("25 клавиш")}</option>
        </select>
      </label>
      <label className="setting">
        <span>{t("Вид клавиш")}</span>
        <select
          className="game-select"
          value={keyStyle}
          aria-label={t("Вид клавиш")}
          onChange={(event) => {
            onKeyStyle(event.target.value as KeyStyle);
          }}
        >
          <option value="classic">{t("Классика")}</option>
          <option value="arcade">{t("Аркада")}</option>
          <option value="perspective">{t("Перспектива (с дорогой)")}</option>
        </select>
      </label>
      {keyStyle === "perspective" ? (
        <CameraSettings camera={camera} onChange={onCamera} />
      ) : (
        <>
          <label className="setting">
            <span>{t("Дорога: горизонт")}</span>
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
            <span>{t("Дорога: ширина у горизонта")}</span>
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
        </>
      )}
      <label className="setting">
        <span>{t("Наклейки с названиями на клавишах")}</span>
        <input
          type="checkbox"
          checked={showLabels}
          onChange={(event) => {
            onShowLabels(event.target.checked);
          }}
        />
      </label>
      <div className="setting setting--views">
        <span>{t("Что показывать")}</span>
        <span className="setting-control setting-control--views">{toggles}</span>
      </div>
    </div>
  );
}
