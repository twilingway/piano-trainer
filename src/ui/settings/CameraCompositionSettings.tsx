import { useI18n } from "../../app/useI18n";
import type { RoadFit } from "../../render/roadLayoutCamera";
import {
  normalizeCameraComposition,
  WORLD_FOV_LIMITS,
  type CameraComposition
} from "../../render/cameraComposition";

export function CameraCompositionSettings({
  value,
  onChange,
  worldFov,
  onWorldFov,
  fixed = false,
  disabled
}: {
  readonly value: CameraComposition;
  readonly onChange: (value: CameraComposition) => void;
  readonly worldFov: number;
  readonly onWorldFov?: ((value: number) => void) | undefined;
  /** The fixed standard road: contact, horizon and width leave the world FOV nothing to change. */
  readonly fixed?: boolean;
  readonly disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="setting">
        <span>{t("Композиция 3D")}</span>
        <select
          className="game-select"
          aria-label={t("Композиция 3D")}
          value={value}
          disabled={disabled}
          data-setting-target="camera-composition"
          onChange={(event) => {
            onChange(normalizeCameraComposition(event.target.value));
          }}
        >
          <option value="standard">{t("Обычная композиция")}</option>
          <option value="game">{t("Игровой кадр")}</option>
          <option value="free">{t("Свободный мир с клавиатурой")}</option>
        </select>
      </label>
      {onWorldFov && (
        <label className="setting">
          <span>{t("Угол обзора мира, °")}</span>
          <span className="setting-control">
            <input
              type="range"
              {...WORLD_FOV_LIMITS}
              step="1"
              value={worldFov}
              disabled={disabled || fixed}
              aria-label={t("Угол обзора мира, °")}
              data-setting-target="world-fov"
              onChange={(event) => {
                onWorldFov(Number(event.target.value));
              }}
            />
            <span className="digits">{worldFov}°</span>
          </span>
        </label>
      )}
      {fixed && !disabled && (
        <p className="setting-hint">
          {t(
            "В обычной композиции дальнюю часть поля задают горизонт и ширина у горизонта. Угол обзора мира действует в свободном осмотре, игровом кадре и свободном мире."
          )}
        </p>
      )}
      <p className="setting-hint">
        {t(
          disabled
            ? "Во время постановки используется её камера. Выбранная композиция вернётся после выключения постановки."
            : "В игровом кадре мир показан отдельной камерой, а клавиатура закреплена снизу. В свободном мире можно вращать и перемещать мировую камеру."
        )}
      </p>
    </>
  );
}

/** Standard road straightening: always straight, or bent until the button's camera snapshot. */
export function RoadFitSettings({
  value,
  onChange,
  onStraighten,
  disabled
}: {
  readonly value: RoadFit["mode"];
  readonly onChange: (value: RoadFit["mode"]) => void;
  readonly onStraighten?: (() => void) | undefined;
  /** Straightening belongs to the standard composition without the free camera or staging. */
  readonly disabled: boolean;
}) {
  const { t } = useI18n();
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
      <p className="setting-hint">
        {t(
          disabled
            ? "Выпрямление дороги действует в обычной композиции без свободной камеры и постановки."
            : value === "auto"
              ? "Дорожки нот всегда идут прямо к клавишам при любой камере клавиатуры."
              : "Кнопка выпрямляет дорожки под текущую камеру клавиатуры. После нового наклона у клавиш снова появится излом."
        )}
      </p>
    </>
  );
}
