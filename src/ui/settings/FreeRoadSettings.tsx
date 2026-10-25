import { useState } from "react";
import { useI18n } from "../../app/useI18n";
import {
  FREE_ROAD_LIMITS,
  normalizeFreeRoadLayout,
  type FreeRoadLayout
} from "../../render/freeRoadLayout";

const METRICS = [
  { key: "height", label: "Высота горизонта, м" },
  { key: "distance", label: "Дальность горизонта, м" },
  { key: "width", label: "Ширина горизонта, м" },
  { key: "radius", label: "Радиус мирового горизонта, м" }
] as const;

function HorizonNumberInput({
  value,
  min,
  max,
  step,
  label,
  target,
  onChange
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label: string;
  readonly target: string;
  readonly onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  return (
    <input
      type="number"
      className="game-input"
      min={min}
      max={max}
      step={step}
      value={editing ? draft : String(value)}
      aria-label={label}
      data-setting-target={target}
      onFocus={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = event.target.valueAsNumber;
        if (event.target.value !== "" && Number.isFinite(next)) onChange(next);
      }}
      onBlur={() => {
        setEditing(false);
        setDraft(String(value));
      }}
    />
  );
}

/** World-space source geometry, independent from screen projection and orbit. */
export function FreeRoadSettings({
  value,
  onChange
}: {
  readonly value: FreeRoadLayout;
  readonly onChange: (change: Partial<FreeRoadLayout>) => void;
}) {
  const { t } = useI18n();
  const normalized = normalizeFreeRoadLayout(value);
  const change = (key: keyof typeof FREE_ROAD_LIMITS, next: number): void => {
    const result = normalizeFreeRoadLayout({ ...normalized, [key]: next });
    onChange({
      [key]: result[key],
      ...(key === "width" && result.radius !== normalized.radius ? { radius: result.radius } : {})
    });
  };
  return (
    <>
      {METRICS.map(({ key, label }) => {
        const limits = FREE_ROAD_LIMITS[key];
        const min = key === "radius" ? Math.max(limits.min, normalized.width / 2) : limits.min;
        const number = normalized[key] ?? normalized.width;
        return (
          <div className="setting projection-setting" key={key}>
            <span>{t(label)}</span>
            <span className="setting-control projection-number-control">
              <input
                type="range"
                min={min}
                max={limits.max}
                step={limits.step}
                value={number}
                aria-label={t(label)}
                data-setting-target={`free-source-${key}`}
                onChange={(event) => {
                  change(key, Number(event.target.value));
                }}
              />
              <HorizonNumberInput
                min={min}
                max={limits.max}
                step={limits.step}
                value={number}
                label={t("{parameter}: числовое значение", { parameter: t(label) })}
                target={`free-source-${key}-number`}
                onChange={(next) => {
                  change(key, next);
                }}
              />
            </span>
          </div>
        );
      })}
      <label className="setting">
        <span>{t("Форма горизонта")}</span>
        <select
          className="game-select"
          value={normalized.shape}
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
          "Высота — нижняя точка горизонта относительно белых клавиш; отрицательная высота опускает его ниже клавиатуры. Дальность отсчитывается от задней линии клавиш. У выпуклой дуги середина выше, у вогнутой — края."
        )}
      </p>
      <p className="setting-hint">
        {t(
          "Ширина — расстояние между крайними источниками. Радиус меняет изгиб отдельно от ширины и не может быть меньше её половины: слишком малое значение увеличивается до этого предела. В режиме линии радиус сохраняется без изгиба."
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
