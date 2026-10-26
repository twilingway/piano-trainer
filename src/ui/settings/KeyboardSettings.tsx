import { RoadProjectionSettings } from "./RoadProjectionSettings";
import type { CameraComposition } from "../../render/cameraComposition";
import { CameraCompositionSettings } from "./CameraCompositionSettings";
import type { FallingNoteStyle } from "../../render/fallingNoteStyle";
import type { FreeRoadLayout } from "../../render/freeRoadLayout";
import { FreeRoadSettings } from "./FreeRoadSettings";
import { StylizedProjectionSettings } from "./StylizedProjectionSettings";
import type { ProjectionParameters } from "../../render/stylizedProjection";
import { useI18n } from "../../app/useI18n";
import { CameraSettings } from "./CameraSettings";
import type { CameraPrefs } from "../../render/worldCamera";
import { SettingsGroup } from "./SettingsGroup";

import type { KeyRange } from "../../app/useFallingView";
import type { HandStyle } from "../../render/handRenderCatalog";
import type { KeyStyle } from "../../render/KeyboardLayer";

interface Props {
  readonly noteProjection?: ProjectionParameters;
  readonly onNoteProjection?: (value: ProjectionParameters) => void;
  readonly keyRange: KeyRange;
  readonly onKeyRange: (range: KeyRange) => void;
  readonly showLabels: boolean;
  readonly onShowLabels: (show: boolean) => void;
  readonly keyStyle: KeyStyle;
  readonly onKeyStyle: (style: KeyStyle) => void;
  readonly fallingNoteStyle: FallingNoteStyle;
  readonly onFallingNoteStyle: (style: FallingNoteStyle) => void;
  readonly notesPerspective: boolean;
  readonly freeRoadLayout: FreeRoadLayout;
  readonly onFreeRoadLayout: (change: Partial<FreeRoadLayout>) => void;
  readonly onNotesPerspective: (on: boolean) => void;
  readonly handStyle: HandStyle;
  readonly onHandStyle: (style: HandStyle) => void;
  readonly flatNoteBurning: boolean;
  readonly onFlatNoteBurning: (on: boolean) => void;
  readonly flatPressEffects: boolean;
  readonly onFlatPressEffects: (on: boolean) => void;
  readonly noteParticles: boolean;
  readonly onNoteParticles: (on: boolean) => void;
  readonly keyboardDim: boolean;
  readonly onKeyboardDim: (dim: boolean) => void;
  readonly roadGuides: boolean;
  readonly onRoadGuides: (on: boolean) => void;
  /** The local pianist instead of the live hands; absent when there is no local model. */
  readonly pianist?: boolean;
  readonly cameraComposition?: CameraComposition;
  readonly onCameraComposition?: (value: CameraComposition) => void;
  readonly worldFov?: number;
  readonly onWorldFov?: (value: number) => void;
  readonly freeCamera?: boolean;
  readonly freeCameraWasd?: boolean;
  readonly onFreeCameraWasd?: (on: boolean) => void;
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
  noteProjection,
  onNoteProjection,
  keyRange,
  onKeyRange,
  showLabels,
  onShowLabels,
  keyStyle,
  onKeyStyle,
  fallingNoteStyle,
  onFallingNoteStyle,
  notesPerspective,
  freeRoadLayout,
  onFreeRoadLayout,
  onNotesPerspective,
  handStyle,
  onHandStyle,
  flatNoteBurning,
  onFlatNoteBurning,
  flatPressEffects,
  onFlatPressEffects,
  noteParticles,
  onNoteParticles,
  keyboardDim,
  onKeyboardDim,
  roadGuides,
  onRoadGuides,
  pianist,
  cameraComposition = "standard",
  onCameraComposition,
  worldFov = 45,
  onWorldFov,
  freeCamera,
  freeCameraWasd,
  onFreeCameraWasd,
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
  const worldInteractive =
    cameraComposition === "free" || (cameraComposition === "standard" && freeCamera);
  const worldVisible = cameraComposition !== "standard" || freeCamera;
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
      <SettingsGroup title={t("Падающие ноты")}>
        <div className="settings-list">
          {noteProjection && onNoteProjection && (
            <StylizedProjectionSettings
              value={noteProjection}
              onChange={onNoteProjection}
              keyboard3d={keyStyle === "3d"}
            />
          )}
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
          {keyStyle === "3d" ? (
            <label className="setting">
              <span>{t("Оформление нот")}</span>
              <select
                className="game-select"
                aria-label={t("Оформление нот")}
                data-setting-target="falling-note-style"
                value={fallingNoteStyle}
                onChange={(event) => {
                  onFallingNoteStyle(event.target.value as FallingNoteStyle);
                }}
              >
                <option value="filled">{t("Объёмные с заливкой")}</option>
                <option value="flat">{t("Как в аркаде")}</option>
                <option value="glass">{t("Прозрачные")}</option>
              </select>
            </label>
          ) : (
            <p
              className="settings-group setting-hint"
              data-setting-target="falling-note-style"
              tabIndex={-1}
            >
              {t("Оформление объёмных нот выбирается в виде клавиш «3D».")}
            </p>
          )}
          {keyStyle === "3d" && worldVisible && !performanceScene ? (
            <FreeRoadSettings value={freeRoadLayout} onChange={onFreeRoadLayout} />
          ) : (
            <>
              <RoadProjectionSettings value={road} enabled={notesPerspective} onChange={onRoad} />
              {!notesPerspective && (
                <p className="setting-hint">
                  {t("Горизонт и ширина у горизонта доступны в перспективной проекции.")}
                </p>
              )}
              <p className="setting-hint">
                {t(
                  "Отрицательные значения задают ширину дальнего края относительно экрана основного вида; свободная камера меняет его ракурс."
                )}
              </p>
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
      <SettingsGroup title={t("Анимация и эффекты")}>
        <p className="setting-hint">
          {t("Эффекты над клавишами работают и при скрытых падающих нотах.")}
        </p>
        <div className="settings-list">
          <label className="setting">
            <span>{t("Горение")}</span>
            <input
              type="checkbox"
              data-setting-target="note-burning"
              checked={flatNoteBurning}
              onChange={(event) => {
                onFlatNoteBurning(event.target.checked);
              }}
            />
          </label>
          <label className="setting">
            <span>{t("Вспышка при нажатии")}</span>
            <input
              type="checkbox"
              data-setting-target="note-flash"
              checked={flatPressEffects}
              onChange={(event) => {
                onFlatPressEffects(event.target.checked);
              }}
            />
          </label>
          <label className="setting">
            <span>{t("Летящие нотки")}</span>
            <input
              type="checkbox"
              data-setting-target="note-particles"
              checked={noteParticles}
              onChange={(event) => {
                onNoteParticles(event.target.checked);
              }}
            />
          </label>
        </div>
      </SettingsGroup>
      <SettingsGroup title={t("Руки и сцена")}>
        <div className="settings-list">
          <label className="setting">
            <span>{t("Вид рук")}</span>
            <select
              className="game-select"
              value={keyStyle === "3d" ? "rendered" : handStyle}
              disabled={keyStyle === "3d"}
              aria-label={t("Вид рук")}
              onChange={(event) => {
                onHandStyle(event.target.value as HandStyle);
              }}
            >
              {keyStyle !== "3d" && <option value="drawn">{t("Рисованные")}</option>}
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
          {keyStyle === "3d" && <CameraSettings camera={camera} onChange={onCamera} />}
          {keyStyle === "3d" && onCameraComposition && (
            <CameraCompositionSettings
              value={cameraComposition}
              onChange={onCameraComposition}
              worldFov={worldFov}
              onWorldFov={onWorldFov}
              disabled={performanceScene ?? false}
            />
          )}
          {keyStyle === "3d" && cameraComposition === "standard" && onFreeCamera && (
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
          {keyStyle === "3d" && worldInteractive && !performanceScene && onFreeCameraWasd && (
            <label className="setting" data-setting-target="free-camera-wasd">
              <span>{t("Передвижение WASD")}</span>
              <input
                type="checkbox"
                checked={freeCameraWasd ?? false}
                onChange={(event) => {
                  onFreeCameraWasd(event.target.checked);
                }}
              />
            </label>
          )}
          {keyStyle === "3d" && worldInteractive && !performanceScene && onFreeCameraWasd && (
            <p className="setting-hint">
              {t(
                "WASD передвигает камеру вместо игры на клавишах. В меню и полях ввода передвижение отключено."
              )}
            </p>
          )}
        </div>
      </SettingsGroup>
    </>
  );
}
