import { SettingsGroup } from "./SettingsGroup";
import { useEffect } from "react";

import { useI18n } from "../../app/useI18n";
import { DEVICE_PRESETS, deviceKeys } from "../../input/deviceRange";
import type { DeviceRange, DevicePreset, RangeCapture } from "../../input/deviceRange";
import { pitchLabel } from "../../input/keyboardLayouts";
import type { MidiDevice } from "../../input/midiInput";
import type { KeyLightSettings } from "../../input/keyLights";
import type { OutputChoice } from "../../input/midiOutput";
import type { MelodyOutputSettings } from "../../input/melodyOutput";
import { AUTO_OUTPUT_ID } from "../../input/midiOutput";
import type { MidiInstrumentPreviewControls } from "../../app/useMidiInstruments";

/** The player's keyboard and capturing it from their lowest and highest keys. */
export interface DeviceRangeControls {
  readonly range: DeviceRange;
  readonly onRange: (range: DeviceRange) => void;
  /** A capture in progress, or null. */
  readonly capture: RangeCapture | null;
  readonly onCapture: () => void;
  readonly onCancelCapture: () => void;
}

/** Where the trainer sends MIDI, the test note that checks the link, and the key lights. */
export interface MidiOutputControls {
  readonly devices: readonly MidiDevice[];
  readonly choice: OutputChoice | null;
  /** The chosen output is connected. */
  readonly connected: boolean;
  /** The option to show: the port in use, the disconnected choice, or "" for none. */
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly onTest: () => void;
  readonly lights: KeyLightSettings;
  readonly onLights: (settings: KeyLightSettings) => void;
  readonly melody: MelodyOutputSettings;
  readonly onMelody: (settings: MelodyOutputSettings) => void;
  readonly resolvedName?: string | undefined;
  readonly preview?: MidiInstrumentPreviewControls | undefined;
}

const LIGHT_CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1);

interface Props {
  readonly devices: readonly MidiDevice[];
  /** The MIDI input that plays; "all" listens to every one. */
  readonly deviceId: string;
  readonly onDevice: (id: string) => void;
  readonly midiError: string | null;
  readonly locked?: boolean;
  readonly keyboard: DeviceRangeControls;
  /** Absent without Web MIDI. */
  readonly output?: MidiOutputControls | undefined;
}

/** The sound and MIDI tab: which piano plays, or why there is none. */
export function MidiSettings({
  devices,
  deviceId,
  onDevice,
  midiError,
  locked = false,
  keyboard,
  output
}: Props) {
  const { t } = useI18n();
  const titles: Readonly<Record<DevicePreset, string>> = {
    "88": t("88 клавиш"),
    "76": t("76 клавиш"),
    "61": t("61 клавиша"),
    "49": t("49 клавиш"),
    "37": t("37 клавиш"),
    "25": t("25 клавиш")
  };
  const span = (range: DeviceRange) => {
    const { low, high } = deviceKeys(range);
    return `${pitchLabel(low)}–${pitchLabel(high)}`;
  };
  const { range, capture, onCancelCapture } = keyboard;
  // A capture lasts while its prompt is on screen: closing the settings or the tab ends it.
  useEffect(() => onCancelCapture, [onCancelCapture]);
  const own = deviceKeys(range);
  return (
    <div className="settings-list">
      <SettingsGroup title={t("Вход и диапазон пианино")}>
        <div className="settings-list">
          {devices.length > 0 ? (
            <label className="setting">
              <span>{t("Пианино")}</span>
              <select
                className="game-select"
                data-setting-target="midi-input"
                value={deviceId}
                disabled={locked}
                onChange={(event) => {
                  onDevice(event.target.value);
                }}
              >
                <option value="all">{t("Все устройства")}</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="setting-hint">
              {devices.length === 1
                ? t("Пианино: {name}", { name: devices[0]?.name ?? "" })
                : midiError
                  ? t(midiError)
                  : t(
                      "Пианино не найдено — подключите USB-кабель или играйте на клавиатуре: Z…/ и Q…P — белые, S D G H J и 2 3 5 6 7 9 0 — чёрные"
                    )}
            </p>
          )}
          <label className="setting">
            <span>{t("Моя клавиатура")}</span>
            <select
              className="game-select"
              aria-label={t("Моя клавиатура")}
              data-setting-target="piano-range"
              value={range.preset}
              disabled={locked || capture !== null}
              onChange={(event) => {
                const preset = event.target.value;
                if (preset !== "custom") keyboard.onRange({ preset: preset as DevicePreset });
              }}
            >
              {DEVICE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {titles[preset]} ({span({ preset })})
                </option>
              ))}
              {range.preset === "custom" && (
                <option value="custom">
                  {t("Свой диапазон: {keys}, клавиш: {count}", {
                    keys: span(range),
                    count: own.high - own.low + 1
                  })}
                </option>
              )}
            </select>
          </label>
          <div className="setting">
            <span className="setting-hint">
              {capture === null
                ? t("Ноты вне клавиатуры играет программа, в счёт они не идут.")
                : capture.step === "first"
                  ? t("Нажмите самую нижнюю клавишу своей клавиатуры")
                  : t("Теперь нажмите самую верхнюю клавишу")}
            </span>
            {capture === null ? (
              <button
                type="button"
                className="game-button"
                disabled={locked}
                onClick={keyboard.onCapture}
              >
                {t("Определить нажатием")}
              </button>
            ) : (
              <button type="button" className="game-button" onClick={keyboard.onCancelCapture}>
                {t("Отмена")}
              </button>
            )}
          </div>
        </div>
      </SettingsGroup>
      {output && (
        <>
          <SettingsGroup title={t("Звук и выход MIDI")}>
            <div className="settings-list">
              <label className="setting">
                <span>{t("Выход MIDI")}</span>
                <select
                  className="game-select"
                  aria-label={t("Выход MIDI")}
                  data-setting-target="midi-output"
                  value={output.selectedId}
                  onChange={(event) => {
                    output.onSelect(event.target.value);
                  }}
                >
                  <option value={AUTO_OUTPUT_ID}>
                    {output.selectedId === AUTO_OUTPUT_ID && output.resolvedName
                      ? t("Автоматически: {name}", { name: output.resolvedName })
                      : t("Автоматически")}
                  </option>
                  <option value="">{t("Нет")}</option>
                  {output.devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                  {output.choice && output.choice.id !== AUTO_OUTPUT_ID && !output.connected && (
                    <option value={output.choice.id}>
                      {t("{name} — нет связи", { name: output.choice.name })}
                    </option>
                  )}
                </select>
              </label>
              {output.selectedId === AUTO_OUTPUT_ID && !output.connected && (
                <p className="setting-hint">
                  {t(
                    "Для автоматического выбора подключите одно пианино или выберите выход вручную."
                  )}
                </p>
              )}
              <div className="setting">
                <span className="setting-hint">{t("Подсветит C4 на секунду.")}</span>
                <button
                  type="button"
                  className="game-button"
                  disabled={!output.connected}
                  onClick={output.onTest}
                >
                  {t("Проверить")}
                </button>
              </div>
              <label className="setting">
                <span>{t("Звук мелодии")}</span>
                <select
                  className="game-select"
                  aria-label={t("Звук мелодии")}
                  data-setting-target="melody-output"
                  value={output.melody.mode}
                  onChange={(event) => {
                    const mode = event.target.value;
                    if (mode === "browser" || mode === "midi" || mode === "both")
                      output.onMelody({ ...output.melody, mode });
                  }}
                >
                  <option value="browser">{t("На этом устройстве")}</option>
                  <option value="midi">{t("На MIDI-пианино")}</option>
                  <option value="both">{t("На обоих устройствах")}</option>
                </select>
              </label>
              <p className="setting-hint">
                {t("Метроном, голосовые подсказки и ручные нажатия звучат на этом устройстве.")}
              </p>
              {output.melody.mode === "browser" && (
                <section
                  className="settings-group"
                  data-setting-target="melody-channel"
                  tabIndex={-1}
                  aria-disabled="true"
                  aria-label={t("Канал мелодии")}
                >
                  <h4 className="settings-group__title">{t("Канал мелодии")}</h4>
                  <p className="setting-hint">
                    {t(
                      "Канал MIDI недоступен: мелодия звучит только на этом устройстве. Он применяется при выводе мелодии на MIDI-пианино."
                    )}
                  </p>
                </section>
              )}
              {output.melody.mode !== "browser" && (
                <>
                  <label className="setting">
                    <span>{t("Канал мелодии")}</span>
                    <select
                      className="game-select"
                      aria-label={t("Канал мелодии")}
                      data-setting-target="melody-channel"
                      value={output.melody.channel}
                      onChange={(event) => {
                        output.onMelody({ ...output.melody, channel: Number(event.target.value) });
                      }}
                    >
                      {LIGHT_CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>
                          {channel}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!output.connected && (
                    <p className="setting-hint">
                      {t("Выберите подключённый выход MIDI, чтобы мелодия звучала на пианино.")}
                    </p>
                  )}
                  {output.lights.enabled && output.lights.channel === output.melody.channel && (
                    <p className="setting-hint">
                      {t(
                        "У мелодии и подсветки один канал. Выберите разные каналы, чтобы ноты не мешали друг другу."
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          </SettingsGroup>
          <SettingsGroup title={t("Подсветка пианино")}>
            <div className="settings-list">
              <label className="setting">
                <span>{t("Подсветка клавиш")}</span>
                <input
                  type="checkbox"
                  checked={output.lights.enabled}
                  onChange={(event) => {
                    output.onLights({ ...output.lights, enabled: event.target.checked });
                  }}
                />
              </label>
              {output.lights.enabled && (
                <>
                  <label className="setting">
                    <span>{t("Канал подсветки")}</span>
                    <select
                      className="game-select"
                      aria-label={t("Канал подсветки")}
                      value={output.lights.channel}
                      onChange={(event) => {
                        output.onLights({ ...output.lights, channel: Number(event.target.value) });
                      }}
                    >
                      {LIGHT_CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>
                          {channel}
                        </option>
                      ))}
                    </select>
                  </label>
                  {output.lights.channel === 1 && (
                    <p className="setting-hint">
                      {t("На канале 1 обычно играет само пианино: такие нажатия не засчитаются.")}
                    </p>
                  )}
                  <label className="setting">
                    <span>{t("Громкость подсветки")}</span>
                    <input
                      type="number"
                      aria-label={t("Громкость подсветки")}
                      min={1}
                      max={127}
                      step={1}
                      value={output.lights.velocity}
                      onChange={(event) => {
                        const velocity = event.target.valueAsNumber;
                        if (Number.isInteger(velocity) && velocity >= 1 && velocity <= 127)
                          output.onLights({ ...output.lights, velocity });
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          </SettingsGroup>
        </>
      )}
    </div>
  );
}
