import { useEffect, useState } from "react";
import { useI18n } from "../../app/useI18n";
import type { PianoProfile } from "../../input/instrumentProfiles";
import { InstrumentChooser } from "./InstrumentChooser";
import example from "../../input/pianoInstrumentsExample.json";

export interface InstrumentProfileControls {
  readonly profiles: readonly PianoProfile[];
  readonly profile: PianoProfile | undefined;
  readonly profileId: string | null;
  readonly instrumentId: string | null;
  readonly error: string | null;
  readonly importing: boolean;
  readonly onProfile: (id: string | null) => void;
  readonly onName: (name: string) => void;
  readonly onInstrument: (id: string | null) => void;
  readonly onImport: (file: File) => Promise<void>;
}

export interface InstrumentPreviewControls {
  readonly available: boolean;
  readonly playing: boolean;
  readonly reason?: string | undefined;
  readonly onPlay: () => void;
  readonly onStop: () => void;
}

interface Props {
  readonly controls: InstrumentProfileControls;
  readonly preview: InstrumentPreviewControls;
}

function ProfileName({ name, onName }: { name: string; onName: (name: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name);
  return (
    <label className="setting">
      <span>{t("Название профиля пианино")}</span>
      <input
        className="game-input"
        aria-label={t("Название профиля пианино")}
        type="text"
        maxLength={120}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (draft !== name) onName(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** A user-owned catalog; hardware commands stay in the MIDI shell. */
export function InstrumentProfileSettings({ controls, preview }: Props) {
  const { t, formatNumber } = useI18n();
  const { profile, onImport } = controls;
  const stop = preview.onStop;
  useEffect(() => stop, [stop]);
  return (
    <section className="settings-list" aria-label={t("Профили и тембры пианино")}>
      <label className="setting">
        <span>{t("Профиль пианино")}</span>
        <select
          className="game-select"
          aria-label={t("Профиль пианино")}
          value={controls.profileId ?? ""}
          onChange={(event) => {
            controls.onProfile(event.target.value || null);
          }}
        >
          <option value="">{t("Не выбран")}</option>
          {controls.profiles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {profile && (
        <ProfileName
          key={`${profile.id}:${profile.name}`}
          name={profile.name}
          onName={controls.onName}
        />
      )}
      <div className="setting">
        <span>{t("Тембр MIDI-пианино")}</span>
        <InstrumentChooser
          key={profile?.id ?? "none"}
          profile={profile}
          value={controls.instrumentId}
          onChange={controls.onInstrument}
        />
      </div>
      {profile ? (
        <p className="setting-hint">
          {t("Тембров в профиле: {count}", { count: formatNumber(profile.instruments.length) })}
        </p>
      ) : (
        <p className="setting-hint">{t("Выберите профиль пианино, чтобы выбрать тембр.")}</p>
      )}
      <p className="setting-hint">
        {t(
          "Название на дисплее может отличаться от MIDI-номера. Неизвестные команды не отправляются."
        )}
      </p>
      <div className="setting">
        <span>{t("Проверка выбранного тембра")}</span>
        <button
          type="button"
          className="game-button"
          disabled={!preview.playing && (!preview.available || !profile)}
          onClick={preview.playing ? preview.onStop : preview.onPlay}
        >
          {preview.playing ? t("Остановить прослушивание") : t("Прослушать тембр")}
        </button>
      </div>
      {preview.reason && <p className="setting-hint">{preview.reason}</p>}
      <label className="setting">
        <span>
          {controls.importing ? t("Читаем профиль пианино…") : t("Добавить пианино из JSON")}
        </span>
        <input
          className="instrument-profile-import"
          aria-label={t("Добавить пианино из JSON")}
          type="file"
          accept=".json,application/json"
          disabled={controls.importing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onImport(file);
          }}
        />
      </label>
      {controls.error && <p role="alert">{controls.error}</p>}
      <details className="setting-hint">
        <summary>{t("Формат импорта пианино")}</summary>
        <p>
          {t(
            "JSON содержит название пианино и массив instruments. У каждого тембра есть name и program: MIDI-номер от 0 до 127 либо null, если команда неизвестна."
          )}
        </p>
        <p>
          {t(
            "bankMSB и bankLSB необязательны: от 0 до 127. Указывайте их только по MIDI-таблице устройства. Номер VOI на панели сам по себе не задаёт банк."
          )}
        </p>
        <p>
          {t(
            "group, panelNumber и id необязательны. midiOutputName помогает автоматически выбрать выход. Повторный импорт добавляет отдельный профиль."
          )}
        </p>
        <pre className="instrument-profile-example">{JSON.stringify(example, null, 2)}</pre>
        <a href={`${import.meta.env.BASE_URL}examples/piano-instruments.json`} download>
          {t("Скачать пример профиля JSON")}
        </a>
      </details>
    </section>
  );
}
