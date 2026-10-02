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
    <section className="settings-section" aria-label="Точность и калибровка">
      <h3>Точность и калибровка</h3>
      <p>
        <small>Поправки применяются к новому исполнению. После изменения нажмите «Сначала».</small>
      </p>
      <p>Устройство: {props.deviceName || props.deviceId || "Компьютерная клавиатура"}</p>
      <label>
        Подключение{" "}
        <select
          value={props.transport}
          disabled={disabled}
          onChange={(event) => {
            props.onTransport(event.target.value as ConnectionType);
          }}
        >
          <option value="usb">USB MIDI</option>
          <option value="ble">Bluetooth MIDI</option>
          <option value="local">Клавиатура / экран</option>
        </select>
      </label>
      {offsets.map(([key, label, hint]) => (
        <label key={key} title={hint}>
          {label}, мс{" "}
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
          <small>{hint}</small>
        </label>
      ))}
      <label>
        Название аудиовыхода{" "}
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
          Укажите выход, которым пользуетесь, например «наушники» или «Bluetooth-колонка». Это метка
          профиля, она не переключает устройство браузера.
        </small>
      </p>
      {profile ? (
        <p>
          Поправка: {profile.inputOffsetMs.toFixed(1)} мс · Разброс: {profile.jitterMs.toFixed(1)}{" "}
          мс
          {" · "}
          {QUALITY[profile.quality]} · Образцы: {profile.calibrationSamples.length}/24
        </p>
      ) : (
        <p>Калибровки этого подключения пока нет. Поправка ввода — 0 мс.</p>
      )}
      {profile && !current && (
        <p role="status">
          Нужна повторная калибровка: измерение неполное, нестабильное или изменён аудиовыход /
          задержка звука.
        </p>
      )}
      <p>
        Нажимайте до первой октавы (C4) под метроном: 4 разминочных удара и 24 измерения. Измерение
        включает вашу реакцию и задержку звука, а не только MIDI-устройство.
      </p>
      {running ? (
        <button type="button" onClick={props.onCancel}>
          Отменить калибровку
        </button>
      ) : (
        <button
          type="button"
          disabled={locked || props.canCalibrate === false}
          onClick={props.onStart}
        >
          Калибровать C4
        </button>
      )}
      {progress && (
        <p aria-live="polite">
          Разминка {progress.warmup}/4 · Измерения {progress.measured}/24
          {progress.complete ? " · Готово" : !running ? " · Не завершено — повторите" : ""}
        </p>
      )}
      {locked && <p>Настройки зафиксированы на время рейтингового исполнения.</p>}
      {props.canCalibrate === false && (
        <p>
          Выберите одно MIDI-устройство в настройках ввода, чтобы калибровать его и открыть
          рейтинговый режим.
        </p>
      )}
      {props.diagnostic && (
        <details>
          <summary>Диагностика ввода</summary>
          <p>
            {props.diagnostic.source} · {props.diagnostic.deviceId} · MIDI {props.diagnostic.pitch}{" "}
            · velocity {props.diagnostic.velocity}
          </p>
          <p>
            Raw {props.diagnostic.raw.toFixed(2)} мс · Corrected{" "}
            {props.diagnostic.corrected.toFixed(2)} мс
            {" · "}Offset {props.diagnostic.offset.toFixed(2)} мс · Jitter{" "}
            {profile?.jitterMs.toFixed(2) ?? "—"} мс
          </p>
          {props.diagnostic.expired && <p>Событие вне активной шкалы времени или просрочено.</p>}
        </details>
      )}
    </section>
  );
}
