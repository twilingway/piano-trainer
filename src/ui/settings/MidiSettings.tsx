import type { MidiDevice } from "../../input/midiInput";

interface Props {
  readonly devices: readonly MidiDevice[];
  /** The MIDI input that plays; "all" listens to every one. */
  readonly deviceId: string;
  readonly onDevice: (id: string) => void;
  readonly midiError: string | null;
  readonly locked?: boolean;
}

/** The sound and MIDI tab: which piano plays, or why there is none. */
export function MidiSettings({ devices, deviceId, onDevice, midiError, locked = false }: Props) {
  return (
    <div className="settings-list">
      {devices.length > 0 ? (
        <label className="setting">
          <span>Пианино</span>
          <select
            className="game-select"
            value={deviceId}
            disabled={locked}
            onChange={(event) => {
              onDevice(event.target.value);
            }}
          >
            <option value="all">Все устройства</option>
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
            ? `Пианино: ${devices[0]?.name ?? ""}`
            : (midiError ??
              "Пианино не найдено — подключите USB-кабель или играйте на клавиатуре: Z…/ и Q…P — белые, S D G H J и 2 3 5 6 7 9 0 — чёрные")}
        </p>
      )}
    </div>
  );
}
