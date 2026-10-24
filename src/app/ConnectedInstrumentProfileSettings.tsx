import { shallowEqual } from "react-redux";
import { InstrumentProfileSettings } from "../ui/settings/InstrumentProfileSettings";
import { useInstrumentProfiles } from "./useInstrumentProfiles";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useI18n } from "./useI18n";
import type { PreviewUnavailable } from "./useMidiInstruments";

const REASONS: Record<PreviewUnavailable, string> = {
  "no-output": "Для прослушивания подключите MIDI-выход.",
  "no-instrument": "Выберите тембр для прослушивания.",
  unmapped: "Для этого тембра MIDI-команда пока неизвестна.",
  conflict: "Для прослушивания выберите разные каналы мелодии и подсветки.",
  playing: "Поставьте исполнение на паузу, чтобы прослушать тембр."
};
const NO_PREVIEW = {
  available: false,
  playing: false,
  reason: "no-output" as const,
  onPlay: () => undefined,
  onStop: () => undefined
};

export function ConnectedInstrumentProfileSettings() {
  const controls = useInstrumentProfiles();
  const { t } = useI18n();
  const preview =
    useRuntimeSelector((runtime) => runtime.input.settings.output?.preview, shallowEqual) ??
    NO_PREVIEW;
  return (
    <InstrumentProfileSettings
      controls={controls}
      preview={{
        ...preview,
        reason: preview.reason ? t(REASONS[preview.reason]) : undefined
      }}
    />
  );
}
