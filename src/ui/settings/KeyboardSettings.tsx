import { useI18n } from "../../app/useI18n";
import { CameraSettings } from "./CameraSettings";
import type { CameraPrefs } from "../../render/worldCamera";
import { SettingsGroup } from "./SettingsGroup";

import type { KeyRange } from "../../app/useFallingView";
import type { HandStyle } from "../../render/handRenderCatalog";
import type { KeyStyle } from "../../render/KeyboardLayer";

interface Props {
  readonly keyRange: KeyRange;
  readonly onKeyRange: (range: KeyRange) => void;
  readonly showLabels: boolean;
  readonly onShowLabels: (show: boolean) => void;
  readonly keyStyle: KeyStyle;
  readonly onKeyStyle: (style: KeyStyle) => void;
  readonly notesPerspective: boolean;
  readonly onNotesPerspective: (on: boolean) => void;
  readonly handStyle: HandStyle;
  readonly onHandStyle: (style: HandStyle) => void;
  readonly flatNoteBurning: boolean;
  readonly onFlatNoteBurning: (on: boolean) => void;
  readonly flatPressEffects: boolean;
  readonly onFlatPressEffects: (on: boolean) => void;
  readonly keyboardDim: boolean;
  readonly onKeyboardDim: (dim: boolean) => void;
  readonly roadGuides: boolean;
  readonly onRoadGuides: (on: boolean) => void;
  /** The local pianist instead of the live hands; absent when there is no local model. */
  readonly pianist?: boolean;
  readonly freeCamera?: boolean;
  readonly performanceScene?: boolean;
  readonly onPerformanceScene?: (on: boolean) => void;
  readonly onFreeCamera?: (on: boolean) => void;
  readonly onPianist?: (on: boolean) => void;
  readonly road: { readonly far: number; readonly horizon: number };
  readonly onRoad: (road: { far?: number; horizon?: number }) => void;
  readonly camera: CameraPrefs;
  readonly onCamera: (camera: CameraPrefs) => void;
}

/** The keyboard tab: how many keys, the stickers and what to show. */
export function KeyboardSettings({
  keyRange,
  onKeyRange,
  showLabels,
  onShowLabels,
  keyStyle,
  onKeyStyle,
  notesPerspective,
  onNotesPerspective,
  handStyle,
  onHandStyle,
  flatNoteBurning,
  onFlatNoteBurning,
  flatPressEffects,
  onFlatPressEffects,
  keyboardDim,
  onKeyboardDim,
  roadGuides,
  onRoadGuides,
  pianist,
  freeCamera,
  performanceScene,
  onPerformanceScene,
  onFreeCamera,
  onPianist,
  camera,
  onCamera,
  road,
  onRoad
}: Props) {
  const { t } = useI18n();
  return (
    <>
      <SettingsGroup title={t("Клавиши")}>
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
              data-setting-target="key-style"
              onChange={(event) => {
                onKeyStyle(event.target.value as KeyStyle);
              }}
            >
              <option value="classic">{t("Классика")}</option>
              <option value="arcade">{t("Аркада")}</option>
              <option value="3d">{t("3D")}</option>
            </select>
          </label>
          {keyStyle === "3d" && (
            <label className="setting">
              <span>{t("Приглушить клавиатуру")}</span>
              <input
                type="checkbox"
                checked={keyboardDim}
                onChange={(event) => {
                  onKeyboardDim(event.target.checked);
                }}
              />
            </label>
          )}
          <label className="setting">
            <span>{t("Названия нот на клавишах")}</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => {
                onShowLabels(event.target.checked);
              }}
            />
          </label>
        </div>
      </SettingsGroup>
      <SettingsGroup title={t("Падающие ноты и эффекты")}>
        <div className="settings-list">
          <label className="setting">
            <span>{t("Проекция нот")}</span>
            <select
              className="game-select"
              aria-label={t("Проекция нот")}
              data-setting-target="notes-projection"
              value={notesPerspective ? "perspective" : "direct"}
              onChange={(event) => {
                onNotesPerspective(event.target.value === "perspective");
              }}
            >
              <option value="direct">{t("Прямо")}</option>
              <option value="perspective">{t("В перспективе")}</option>
            </select>
          </label>
          {(keyStyle === "classic" || keyStyle === "arcade") && (
            <>
              <label className="setting">
                <span>{t("Горение нот")}</span>
                <input
                  type="checkbox"
                  checked={flatNoteBurning}
                  onChange={(event) => {
                    onFlatNoteBurning(event.target.checked);
                  }}
                />
              </label>
              <label className="setting">
                <span>{t("Эффекты нажатия")}</span>
                <input
                  type="checkbox"
                  checked={flatPressEffects}
                  onChange={(event) => {
                    onFlatPressEffects(event.target.checked);
                  }}
                />
              </label>
            </>
          )}
          {keyStyle === "3d" && (
            <label className="setting">
              <span>{t("Линии перспективы")}</span>
              <input
                type="checkbox"
                checked={roadGuides}
                onChange={(event) => {
                  onRoadGuides(event.target.checked);
                }}
              />
            </label>
          )}
        </div>
      </SettingsGroup>
      <SettingsGroup title={t("Руки и сцена")}>
        <div className="settings-list">
          <label className="setting">
            <span>{t("Вид рук")}</span>
            <select
              className="game-select"
              value={handStyle}
              aria-label={t("Вид рук")}
              onChange={(event) => {
                onHandStyle(event.target.value as HandStyle);
              }}
            >
              <option value="drawn">{t("Рисованные")}</option>
              <option value="rendered">{t("3D")}</option>
            </select>
          </label>
          {keyStyle === "3d" && onPerformanceScene && (
            <label className="setting">
              <span>{t("Сцена исполнения")}</span>
              <input
                type="checkbox"
                checked={performanceScene ?? false}
                onChange={(event) => {
                  onPerformanceScene(event.target.checked);
                }}
              />
            </label>
          )}
          {keyStyle === "3d" && pianist !== undefined && onPianist && (
            <label className="setting">
              <span>{t("Мой пианист (проба)")}</span>
              <input
                type="checkbox"
                checked={pianist}
                onChange={(event) => {
                  onPianist(event.target.checked);
                }}
              />
            </label>
          )}
        </div>
      </SettingsGroup>
      <SettingsGroup title={t("Камера")}>
        <div className="settings-list">
          {keyStyle === "3d" ? (
            <CameraSettings camera={camera} onChange={onCamera} />
          ) : (
            <>
              <label className="setting">
                <span>{t("Перспектива: горизонт")}</span>
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
                <span>{t("Перспектива: ширина у горизонта")}</span>
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
          {keyStyle === "3d" && onFreeCamera && (
            <label className="setting">
              <span>{t("Свободная камера")}</span>
              <input
                type="checkbox"
                checked={freeCamera ?? false}
                onChange={(event) => {
                  onFreeCamera(event.target.checked);
                }}
              />
            </label>
          )}
        </div>
      </SettingsGroup>
    </>
  );
}
