import { useI18n } from "../../app/useI18n";
import type { FreeRoadLayout } from "../../render/freeRoadLayout";

const METRICS = [
  { key: "height", label: "Высота горизонта, м", min: 0.25, max: 8, step: 0.05 },
  { key: "distance", label: "Дальность горизонта, м", min: 0, max: 20, step: 0.05 },
  { key: "width", label: "Ширина горизонта, м", min: 0.25, max: 30, step: 0.05 }
] as const;

/** World-space source geometry, independent from screen projection and orbit. */
export function FreeRoadSettings({
  value,
  onChange
}: {
  readonly value: FreeRoadLayout;
  readonly onChange: (change: Partial<FreeRoadLayout>) => void;
}) {
  const { t, locale } = useI18n();
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <>
      {METRICS.map(({ key, label, min, max, step }) => (
        <label className="setting" key={key}>
          <span>{t(label)}</span>
          <span className="setting-control">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value[key]}
              aria-label={t(label)}
              data-setting-target={`free-source-${key}`}
              onChange={(event) => {
                onChange({ [key]: Number(event.target.value) });
              }}
            />
            <span className="digits">{format.format(value[key])}</span>
          </span>
        </label>
      ))}
      <label className="setting">
        <span>{t("Форма горизонта")}</span>
        <select
          className="game-select"
          value={value.shape}
          aria-label={t("Форма горизонта")}
          data-setting-target="free-source-shape"
          onChange={(event) => {
            onChange({ shape: event.target.value as FreeRoadLayout["shape"] });
          }}
        >
          <option value="line">{t("Линия")}</option>
          <option value="convex">{t("Выпуклая дуга")}</option>
          <option value="concave">{t("Вогнутая дуга")}</option>
        </select>
      </label>
      <p className="setting-hint">
        {t(
          "Горизонт — точки появления нот. Высота — нижняя точка над белыми клавишами, дальность — от задней линии клавиш. У выпуклой дуги середина выше, у вогнутой — края."
        )}
      </p>
      <p className="setting-hint">
        {t(
          "Ширина задана в метрах мира и не меняется при вращении камеры. У каждой клавиши выбранного диапазона, включая чёрные, свой постоянный источник; повторные ноты идут из него же."
        )}
      </p>
    </>
  );
}
