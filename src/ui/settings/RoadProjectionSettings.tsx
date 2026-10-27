import { useI18n } from "../../app/useI18n";
import { normalizeRoadHorizon, ROAD_HORIZON_MAX, ROAD_HORIZON_MIN } from "../../render/roadHorizon";
import { ProjectionNumberInput } from "./ProjectionNumberInput";

interface Props {
  readonly value: { readonly horizon: number; readonly far: number };
  readonly enabled: boolean;
  readonly onChange: (change: { horizon?: number; far?: number }) => void;
}

/** Percent controls for the legacy screen projection; world metres keep their own controls. */
export function RoadProjectionSettings({ value, enabled, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="settings-list">
      {[
        {
          key: "horizon",
          label: t("Перспектива: горизонт"),
          target: "road-horizon",
          min: ROAD_HORIZON_MIN * 100,
          max: ROAD_HORIZON_MAX * 100,
          value: value.horizon
        },
        {
          key: "far",
          label: t("Перспектива: ширина у горизонта"),
          target: "road-width",
          min: -100,
          max: 90,
          value: value.far
        }
      ].map(({ key, label, target, min, max, value: current }) => {
        const percent = Math.round(current * 10000) / 100;
        const change = (next: number) => {
          if (!Number.isFinite(next)) return;
          onChange(
            key === "horizon"
              ? { horizon: normalizeRoadHorizon(next / 100, current) }
              : { far: Math.max(-1, Math.min(0.9, next / 100)) }
          );
        };
        return (
          <div className="setting road-projection-setting" key={key}>
            <span>{label}</span>
            <span className="setting-control projection-number-control">
              <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={percent}
                disabled={!enabled}
                aria-label={label}
                data-setting-target={target}
                onChange={(event) => {
                  change(Number(event.target.value));
                }}
              />
              <ProjectionNumberInput
                min={min}
                max={max}
                step={1}
                value={percent}
                disabled={!enabled}
                label={t("{parameter}: числовое значение", { parameter: label })}
                target={target + "-number"}
                onChange={change}
              />
              <span aria-hidden="true">%</span>
            </span>
          </div>
        );
      })}
      {enabled && (
        <p className="setting-hint">
          {t("100% — линия клавиш. Значения выше опускают горизонт ниже неё.")}
        </p>
      )}
    </div>
  );
}
