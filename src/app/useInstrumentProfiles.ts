import { useEffect, useRef, useState } from "react";
import {
  GRACE_BP300,
  MAX_CUSTOM_PIANO_PROFILES,
  MAX_PIANO_NAME_LENGTH,
  MAX_PIANO_PROFILE_BYTES,
  parsePianoProfile,
  type PianoProfileImportError
} from "../input/instrumentProfiles";
import type { InstrumentProfileControls } from "../ui/settings/InstrumentProfileSettings";
import { activePianoProfile, allPianoProfiles } from "./instrumentProfilePreferences";
import { preferencesActions } from "./preferencesSlice";
import { useAppSelector, useAppStore } from "./storeHooks";
import { useI18n } from "./useI18n";

type ProfileError = PianoProfileImportError | { code: "profile-limit" | "read-failed" };

/** Import reads are owned by the open settings panel, not the renderer or MIDI clock. */
export function useInstrumentProfiles(): InstrumentProfileControls {
  const { t, formatNumber } = useI18n();
  const store = useAppStore();
  const preferences = useAppSelector((state) => state.preferences.instrumentProfiles);
  const [error, setError] = useState<ProfileError | null>(null);
  const [importing, setImporting] = useState(false);
  const importGeneration = useRef(0);
  useEffect(
    () => () => {
      importGeneration.current++;
    },
    []
  );
  const importErrorText = (reason: ProfileError) => {
    const number = formatNumber(("index" in reason ? (reason.index ?? 0) : 0) + 1);
    const messages: Record<ProfileError["code"], string> = {
      "profile-limit": t("Можно добавить не больше 64 профилей пианино."),
      "read-failed": t("Не удалось открыть файл профиля пианино."),
      "too-large": t("Файл профиля больше 1 МиБ."),
      "invalid-json": t("Не удалось прочитать JSON. Проверьте формат файла."),
      "invalid-profile": t("В профиле нужны название пианино и список instruments."),
      "unsupported-version": t("Эта версия профиля не поддерживается. Используйте version: 1."),
      "invalid-name": t("Название пианино должно содержать от 1 до 120 символов."),
      "invalid-output-name": t(
        "midiOutputName должен быть непустым названием MIDI-выхода до 120 символов."
      ),
      "invalid-instruments": t("В instruments должно быть от 1 до 512 тембров."),
      "invalid-instrument": t("Проверьте название, id и другие поля тембра в записи {number}.", {
        number
      }),
      "invalid-program": t(
        "В записи {number} program должен быть целым числом от 0 до 127 либо null.",
        { number }
      ),
      "invalid-bank": t(
        "В записи {number} банк должен быть числом от 0 до 127 и использоваться с числовым program.",
        { number }
      ),
      "duplicate-id": t("В записи {number} повторяется id тембра. Сделайте id уникальными.", {
        number
      })
    };
    return messages[reason.code];
  };
  const readCurrent = () => store.getState().preferences.instrumentProfiles;
  const save = (next: typeof preferences) => {
    store.dispatch(preferencesActions.instrumentProfilesChanged(next));
    setError(null);
  };
  return {
    profiles: allPianoProfiles(preferences),
    profile: activePianoProfile(preferences),
    profileId: preferences.profileId,
    instrumentId: preferences.instrumentId,
    error: error ? importErrorText(error) : null,
    importing,
    onProfile(id) {
      const current = readCurrent();
      if (id !== null && !allPianoProfiles(current).some((profile) => profile.id === id)) return;
      importGeneration.current++;
      setImporting(false);
      save({ ...current, profileId: id, instrumentId: null });
    },
    onName(value) {
      const current = readCurrent();
      if (!activePianoProfile(current)) return;
      const name = value.trim();
      if (!name || name.length > MAX_PIANO_NAME_LENGTH) {
        setError({ code: "invalid-name" });
        return;
      }
      save(
        current.profileId === GRACE_BP300.id
          ? { ...current, graceName: name }
          : {
              ...current,
              customProfiles: current.customProfiles.map((profile) =>
                profile.id === current.profileId ? { ...profile, name } : profile
              )
            }
      );
    },
    onInstrument(id) {
      const current = readCurrent();
      const profile = activePianoProfile(current);
      if (!profile) return;
      const instrument = profile.instruments.find((item) => item.id === id);
      if (id !== null && instrument?.program == null) return;
      save({ ...current, instrumentId: id });
    },
    async onImport(file) {
      const generation = ++importGeneration.current;
      setError(null);
      if (file.size > MAX_PIANO_PROFILE_BYTES) {
        setImporting(false);
        setError({ code: "too-large" });
        return;
      }
      setImporting(true);
      try {
        const text = await file.text();
        if (generation !== importGeneration.current) return;
        const result = parsePianoProfile(text);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const current = readCurrent();
        if (current.customProfiles.length >= MAX_CUSTOM_PIANO_PROFILES) {
          setError({ code: "profile-limit" });
          return;
        }
        const profile = { ...result.profile, id: crypto.randomUUID() };
        save({
          ...current,
          customProfiles: [...current.customProfiles, profile],
          profileId: profile.id,
          instrumentId: null
        });
      } catch {
        if (generation === importGeneration.current) setError({ code: "read-failed" });
      } finally {
        if (generation === importGeneration.current) setImporting(false);
      }
    }
  };
}
