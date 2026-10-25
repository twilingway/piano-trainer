import { useI18n } from "../../app/useI18n";
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
  disabled
}: {
  readonly value: CameraComposition;
  readonly onChange: (value: CameraComposition) => void;
  readonly worldFov: number;
  readonly onWorldFov?: ((value: number) => void) | undefined;
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
      {value !== "standard" && onWorldFov && (
        <label className="setting">
          <span>{t("Угол обзора мира, °")}</span>
          <span className="setting-control">
            <input
              type="range"
              {...WORLD_FOV_LIMITS}
              step="1"
              value={worldFov}
              disabled={disabled}
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
