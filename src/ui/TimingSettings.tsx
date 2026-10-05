import { useI18n } from "../app/useI18n";
import type { CalibrationProgress, ConnectionType } from "../practice/calibration";
import {
  calibrationIsCurrent,
  type TimingPreferences,
  type TimingProfile
} from "../app/timingPreferences";

export interface TimingSettingsProps {
  preferences: TimingPreferences;
  deviceId: string;
  deviceName: string;
  transport: ConnectionType;
  profile?: TimingProfile;
  progress: CalibrationProgress | null;
  running: boolean;
  locked?: boolean;
  canCalibrate?: boolean;
  diagnostic?: {
    source: string;
    deviceId: string;
    pitch: number;
    velocity: number;
    raw: number;
    corrected: number;
    offset: number;
    expired: boolean;
  };
  onTransport: (transport: ConnectionType) => void;
  onOffsets: (
    values: Partial<
      Pick<
        TimingPreferences,
        "manualOffsetMs" | "audioOffsetMs" | "visualOffsetMs" | "audioOutputId"
      >
    >
  ) => void;
  onStart: () => void;
  onCancel: () => void;
}
const QUALITY = {
  excellent: "Отлично",
  good: "Хорошо",
  acceptable: "Приемлемо",
  unstable: "Нестабильно"
};
export function TimingSettings(props: TimingSettingsProps) {
  const { t, formatNumber } = useI18n();
  const { preferences, profile, progress, running, locked = false } = props;
  const current = calibrationIsCurrent(
    profile,
    preferences.audioOffsetMs,
    preferences.audioOutputId
  );
  const disabled = running || locked;
  const offsets = [
    ["manualOffsetMs", "Поправка ввода", "Вычитается из времени нажатия вместе с калибровкой."],
    ["audioOffsetMs", "Задержка звука", "Положительное значение запускает звук раньше."],
    [
      "visualOffsetMs",
      "Поправка изображения",
      "Положительное значение задерживает изображение; оценка не меняется."
    ]
  ] as const;
  return (
    <section className="settings-section" aria-label={t("Точность и калибровка")}>
      <h3>{t("Точность и калибровка")}</h3>
      <p>
        <small>
          {t("Поправки применяются к новому исполнению. После изменения нажмите «Сначала».")}
        </small>
      </p>
      <p>
        {t("Устройство:")} {props.deviceName || props.deviceId || t("Компьютерная клавиатура")}
      </p>
      <label>
        {t("Подключение")}{" "}
        <select
          value={props.transport}
          disabled={disabled}
          onChange={(event) => {
            props.onTransport(event.target.value as ConnectionType);
          }}
        >
          <option value="usb">USB MIDI</option>
          <option value="ble">Bluetooth MIDI</option>
          <option value="local">{t("Клавиатура / экран")}</option>
        </select>
      </label>
      {offsets.map(([key, label, hint]) => (
        <label key={key} title={t(hint)}>
          {t("{label}, мс", { label: t(label) })}{" "}
          <input
            type="number"
            min={-1000}
            max={1000}
            step={1}
            value={preferences[key]}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value))
                props.onOffsets({ [key]: Math.max(-1000, Math.min(1000, value)) });
            }}
          />
          <small>{t(hint)}</small>
        </label>
      ))}
      <label>
        {t("Название аудиовыхода")}{" "}
        <input
          value={preferences.audioOutputId}
          disabled={disabled}
          onChange={(event) => {
            props.onOffsets({ audioOutputId: event.target.value });
          }}
        />
      </label>
      <p>
        <small>
          {t(
            "Укажите выход, которым пользуетесь, например «наушники» или «Bluetooth-колонка». Это метка профиля, она не переключает устройство браузера."
          )}
        </small>
      </p>
      {profile ? (
        <p>
          {t("Поправка: {offset} мс · Разброс: {jitter} мс · {quality} · Образцы: {samples}/24", {
            offset: formatNumber(profile.inputOffsetMs, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1
            }),
            jitter: formatNumber(profile.jitterMs, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1
            }),
            quality: t(QUALITY[profile.quality]),
            samples: formatNumber(profile.calibrationSamples.length)
          })}
        </p>
      ) : (
        <p>{t("Калибровки этого подключения пока нет. Поправка ввода — 0 мс.")}</p>
      )}
      {profile && !current && (
        <p role="status">
          {t(
            "Нужна повторная калибровка: измерение неполное, нестабильное или изменён аудиовыход / задержка звука."
          )}
        </p>
      )}
      <p>
        {t(
          "Нажимайте до первой октавы (C4) под метроном: 4 разминочных удара и 24 измерения. Измерение включает вашу реакцию и задержку звука, а не только MIDI-устройство."
        )}
      </p>
      {running ? (
        <button type="button" onClick={props.onCancel}>
          {t("Отменить калибровку")}
        </button>
      ) : (
        <button
          type="button"
          disabled={locked || props.canCalibrate === false}
          onClick={props.onStart}
        >
          {t("Калибровать C4")}
        </button>
      )}
      {progress && (
        <p aria-live="polite">
          {t("Разминка {warmup}/4 · Измерения {measured}/24", {
            warmup: formatNumber(progress.warmup),
            measured: formatNumber(progress.measured)
          })}
          {progress.complete ? t(" · Готово") : !running ? t(" · Не завершено — повторите") : ""}
        </p>
      )}
      {locked && <p>{t("Настройки зафиксированы на время рейтингового исполнения.")}</p>}
      {props.canCalibrate === false && (
        <p>
          {t(
            "Выберите одно MIDI-устройство в настройках ввода, чтобы калибровать его и открыть рейтинговый режим."
          )}
        </p>
      )}
      {props.diagnostic && (
        <details>
          <summary>{t("Диагностика ввода")}</summary>
          <p>
            {props.diagnostic.source} · {props.diagnostic.deviceId} · MIDI {props.diagnostic.pitch}{" "}
            · velocity {props.diagnostic.velocity}
          </p>
          <p>
            Raw{" "}
            {formatNumber(props.diagnostic.raw, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{" "}
            {t("мс · Corrected")}{" "}
            {formatNumber(props.diagnostic.corrected, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{" "}
            {t("мс")} {" · "}Offset{" "}
            {formatNumber(props.diagnostic.offset, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{" "}
            {t("мс · Jitter")}{" "}
            {profile
              ? formatNumber(profile.jitterMs, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              : "—"}{" "}
            {t("мс")}
          </p>
          {props.diagnostic.expired && (
            <p>{t("Событие вне активной шкалы времени или просрочено.")}</p>
          )}
        </details>
      )}
    </section>
  );
}
