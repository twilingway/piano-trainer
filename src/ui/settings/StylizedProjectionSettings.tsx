import { useI18n } from "../../app/useI18n";
import { useState } from "react";
import {
  normalizeProjectionParameters,
  PROJECTION_PRESETS,
  type ProjectionParameters
} from "../../render/stylizedProjection";

const CONTROLS = [
  { key: "horizonY", label: "Высота экранного горизонта", min: 0.02, max: 0.6, step: 0.01 },
  { key: "horizonSpread", label: "Размах экранного горизонта", min: 0.1, max: 1.5, step: 0.01 },
  { key: "horizonRadius", label: "Радиус горизонта", min: 0.05, max: 10000, step: 0.05 },
  { key: "depthExponent", label: "Кривая приближения нот", min: 0.5, max: 3, step: 0.05 },
  { key: "landingStraighten", label: "Выпрямление у клавиш", min: 0.02, max: 0.4, step: 0.01 },
  { key: "noteScaleNear", label: "Масштаб нот у клавиш", min: 0.2, max: 2, step: 0.05 },
  { key: "noteScaleFar", label: "Масштаб нот у горизонта", min: 0.02, max: 0.8, step: 0.01 },
  { key: "laneGlow", label: "Свечение дорожек", min: 0, max: 2, step: 0.05 },
  { key: "noteGlow", label: "Свечение блоков нот", min: 0, max: 2, step: 0.05 }
] as const;

const PRESET_LABELS = {
  flat: "Прямой горизонт",
  curved: "Изогнутый горизонт",
  sunset: "Кинематографический закат"
} as const;

const FLAGS = [
  { key: "debugMapping", label: "Диагностика 88 дорожек" },
  { key: "debugEvery12", label: "Показывать каждую 12-ю дорожку" },
  { key: "geometryOnly", label: "Только геометрия без фона и свечения" }
] as const;

function ProjectionNumberInput({
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
      onBlur={() => {
        setEditing(false);
        setDraft(String(value));
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber))
          onChange(event.target.valueAsNumber);
      }}
    />
  );
}

/** Low-frequency preference controls; animation frames never subscribe to this component. */
export function StylizedProjectionSettings({
  value,
  onChange,
  keyboard3d
}: {
  readonly value: ProjectionParameters;
  readonly onChange: (value: ProjectionParameters) => void;
  readonly keyboard3d: boolean;
}) {
  const { t } = useI18n();
  const change = (patch: Partial<ProjectionParameters>) => {
    onChange(normalizeProjectionParameters({ ...value, ...patch }));
  };
  return (
    <div className="projection-settings">
      <label className="setting">
        <span>{t("Система проекции")}</span>
        <select
          className="game-select"
          value={value.mode}
          aria-label={t("Система проекции")}
          data-setting-target="stylized-projection"
          onChange={(event) => {
            change({ mode: event.target.value as ProjectionParameters["mode"] });
          }}
        >
          <option value="legacy">{t("Прежняя проекция")}</option>
          <option value="stylizedProjection">{t("Художественная проекция")}</option>
        </select>
      </label>
      {!keyboard3d && (
        <p className="setting-hint">
          {t(
            "Художественная проекция работает с видом клавиш «3D». Другие виды сохраняют прежнюю проекцию."
          )}
        </p>
      )}
      {value.mode === "stylizedProjection" && (
        <>
          <div
            className="projection-presets"
            role="group"
            aria-label={t("Пресеты художественной проекции")}
          >
            {PROJECTION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="game-button"
                onClick={() => {
                  onChange({ ...preset.parameters, mode: "stylizedProjection" });
                }}
              >
                {t(PRESET_LABELS[preset.id])}
              </button>
            ))}
          </div>
          {CONTROLS.map(({ key, label, min, max, step }) => (
            <div className="setting projection-setting" key={key}>
              <span>{t(label)}</span>
              <span className="setting-control projection-number-control">
                <input
                  type="range"
                  min={key === "horizonRadius" ? Math.log10(min) : min}
                  max={key === "horizonRadius" ? Math.log10(max) : max}
                  step={key === "horizonRadius" ? 0.005 : step}
                  value={key === "horizonRadius" ? Math.log10(value[key]) : value[key]}
                  aria-label={t(label)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    change({
                      [key]: key === "horizonRadius" ? Math.round(10 ** next * 100) / 100 : next
                    });
                  }}
                />
                <ProjectionNumberInput
                  min={min}
                  max={max}
                  step={step}
                  value={value[key]}
                  label={t("{parameter}: числовое значение", { parameter: t(label) })}
                  target={`projection-${key}`}
                  onChange={(next) => {
                    change({ [key]: next });
                  }}
                />
              </span>
            </div>
          ))}
          <p className="setting-hint">
            {t(
              "Меньше радиус — сильнее изгиб, больше радиус — горизонт прямее. Радиус и размах заданы в долях ширины игрового поля; высота и выпрямление — в долях его высоты."
            )}
          </p>
          <label className="setting">
            <span>{t("Направление дуги горизонта")}</span>
            <select
              className="game-select"
              value={value.horizonArcDirection}
              aria-label={t("Направление дуги горизонта")}
              onChange={(event) => {
                change({ horizonArcDirection: event.target.value as "up" | "down" });
              }}
            >
              <option value="up">{t("Середина выше краёв")}</option>
              <option value="down">{t("Середина ниже краёв")}</option>
            </select>
          </label>
          {FLAGS.map(({ key, label }) => (
            <label className="setting" key={key}>
              <span>{t(label)}</span>
              <input
                type="checkbox"
                checked={value[key]}
                onChange={(event) => {
                  change({ [key]: event.target.checked });
                }}
              />
            </label>
          ))}
        </>
      )}
    </div>
  );
}
