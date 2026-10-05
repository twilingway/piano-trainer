import { useI18n } from "../../app/useI18n";
import { DEFAULT_CAMERA } from "../../render/worldCamera";
import type { CameraPrefs } from "../../render/worldCamera";

interface Props {
  readonly camera: CameraPrefs;
  readonly onChange: (camera: CameraPrefs) => void;
}

const CONTROLS: readonly {
  key: keyof CameraPrefs;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
}[] = [
  { key: "fov", label: "Угол обзора", min: 25, max: 85, step: 1, suffix: "°" },
  { key: "height", label: "Высота камеры", min: 25, max: 420, step: 5, suffix: "" },
  { key: "distance", label: "Дистанция камеры", min: 120, max: 1200, step: 10, suffix: "" },
  { key: "pitch", label: "Наклон камеры", min: -5, max: 60, step: 1, suffix: "°" },
  {
    key: "targetY",
    label: "Камера: сдвиг по вертикали",
    min: -250,
    max: 250,
    step: 5,
    suffix: " px"
  },
  { key: "scale", label: "Масштаб клавиатуры", min: 0.55, max: 1.6, step: 0.01, suffix: "%" }
];

/** Camera controls stay in the scrollable settings rather than covering the piano. */
export function CameraSettings({ camera, onChange }: Props) {
  const { t } = useI18n();
  return (
    <>
      {CONTROLS.map(({ key, label, min, max, step, suffix }) => (
        <label className="setting" key={key}>
          <span>{t(label)}</span>
          <span className="setting-control">
            <input
              aria-label={t(label)}
              type="range"
              min={min}
              max={max}
              step={step}
              value={camera[key]}
              onChange={(event) => {
                onChange({ ...camera, [key]: Number(event.target.value) });
              }}
            />
            <span className="digits">
              {key === "scale" ? Math.round(camera[key] * 100) : camera[key]}
              {suffix}
            </span>
          </span>
        </label>
      ))}
      <button
        className="game-button"
        type="button"
        onClick={() => {
          onChange(DEFAULT_CAMERA);
        }}
      >
        {t("Сбросить камеру")}
      </button>
    </>
  );
}
