import { useI18n } from "../../app/useI18n";
import type { RoadFit } from "../../render/roadLayoutCamera";
import { ProjectionNumberInput } from "./ProjectionNumberInput";
import { WORLD_FOV_LIMITS } from "../../render/cameraComposition";

/** The free camera's field of view; the standard view's far field follows the horizon instead. */
export function CameraCompositionSettings({
  worldFov,
  onWorldFov,
  free,
  disabled
}: {
  readonly worldFov: number;
  readonly onWorldFov: (value: number) => void;
  readonly free: boolean;
  readonly disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="setting">
        <span>{t("Угол обзора мира, °")}</span>
        <span className="setting-control">
          <input
            type="range"
            {...WORLD_FOV_LIMITS}
            step="1"
            value={worldFov}
            disabled={disabled || !free}
            aria-label={t("Угол обзора мира, °")}
            data-setting-target="world-fov"
            onChange={(event) => {
              onWorldFov(Number(event.target.value));
            }}
          />
          <span className="digits">{worldFov}°</span>
        </span>
      </label>
      {(disabled || !free) && (
        <p className="setting-hint">
          {t(
            disabled
              ? "Во время постановки используется её камера. Выбранный вид вернётся после выключения постановки."
              : "Угол обзора мира действует в свободной камере. В обычном виде дальнюю часть поля задают горизонт и ширина у горизонта."
          )}
        </p>
      )}
    </>
  );
}

/** Standard road straightening: always straight, or bent until the button's camera snapshot. */
export function RoadFitSettings({
  value,
  onChange,
  onStraighten,
  tilt = 0,
  onTilt,
  disabled
}: {
  readonly value: RoadFit["mode"];
  readonly onChange: (value: RoadFit["mode"]) => void;
  readonly onStraighten?: (() => void) | undefined;
  /** 0 keeps straightened lanes in the world direction, 1 follows the keyboard's perspective. */
  readonly tilt?: number;
  readonly onTilt?: ((value: number) => void) | undefined;
  /** Straightening belongs to the standard view without the free camera or staging. */
  readonly disabled: boolean;
}) {
  const { t } = useI18n();
  const tiltLabel = t("Наклон нот за клавиатурой");
  const tiltPercent = Math.round(tilt * 100);
  const changeTilt = (next: number) => {
    if (Number.isFinite(next)) onTilt?.(Math.max(0, Math.min(100, next)) / 100);
  };
  return (
    <>
      <label className="setting">
        <span>{t("Выпрямление дороги")}</span>
        <select
          className="game-select"
          aria-label={t("Выпрямление дороги")}
          value={value}
          disabled={disabled}
          data-setting-target="road-fit"
          onChange={(event) => {
            onChange(event.target.value === "auto" ? "auto" : "button");
          }}
        >
          <option value="auto">{t("Автоматически")}</option>
          <option value="button">{t("По кнопке")}</option>
        </select>
      </label>
      {value === "button" && onStraighten && (
        <button className="game-button" type="button" disabled={disabled} onClick={onStraighten}>
          {t("Выпрямить по клавиатуре")}
        </button>
      )}
      {onTilt && (
        <div className="setting road-projection-setting">
          <span>{tiltLabel}</span>
          <span className="setting-control projection-number-control">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={tiltPercent}
              disabled={disabled}
              aria-label={tiltLabel}
              data-setting-target="road-note-tilt"
              onChange={(event) => {
                changeTilt(Number(event.target.value));
              }}
            />
            <ProjectionNumberInput
              min={0}
              max={100}
              step={5}
              value={tiltPercent}
              disabled={disabled}
              label={t("{parameter}: числовое значение", { parameter: tiltLabel })}
              target="road-note-tilt-number"
              onChange={changeTilt}
            />
            <span aria-hidden="true">%</span>
          </span>
        </div>
      )}
      <p className="setting-hint">
        {t(
          disabled
            ? "Выпрямление дороги действует в обычном виде без свободной камеры и постановки."
            : value === "auto"
              ? "Дорожки нот всегда идут прямо к клавишам при любой камере клавиатуры."
              : "Кнопка выпрямляет дорожки под текущую камеру клавиатуры. После нового наклона у клавиш снова появится излом."
        )}
      </p>
    </>
  );
}
