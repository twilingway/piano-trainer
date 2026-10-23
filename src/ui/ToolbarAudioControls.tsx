import { useI18n } from "../app/useI18n";
import type { PartsChoice } from "./CompactPracticeChoices";
import type { HandsChoice } from "./PlayerTopBar";
import { ListenIcon, MetronomeIcon } from "./icons";

interface Props {
  readonly hands: HandsChoice;
  readonly parts: PartsChoice | undefined;
  readonly metronome:
    { readonly enabled: boolean; readonly onChange: (on: boolean) => void } | undefined;
  readonly disabled: boolean | undefined;
}

/** Quick sound switches for the desktop bar, sharing the settings' state and commands. */
export function ToolbarAudioControls({ hands, parts, metronome, disabled }: Props) {
  const { t } = useI18n();
  return (
    <>
      {parts && hands !== "listen" && (
        <button
          type="button"
          className="game-button topbar-audio-toggle"
          aria-pressed={parts.accompaniment}
          aria-label={t("Автоаккомпанемент")}
          title={`${t("Автоаккомпанемент")}: ${t("Остальные партии играет программа.")}`}
          disabled={disabled}
          onClick={() => {
            parts.onAccompaniment(!parts.accompaniment);
          }}
        >
          <ListenIcon />
          <span className="topbar-audio-toggle__label">{t("Автоаккомпанемент")}</span>
        </button>
      )}
      {metronome && (
        <button
          type="button"
          className="game-button topbar-audio-toggle"
          aria-pressed={metronome.enabled}
          aria-label={t("Метроном")}
          title={t("Метроном")}
          disabled={disabled}
          onClick={() => {
            metronome.onChange(!metronome.enabled);
          }}
        >
          <MetronomeIcon />
          <span className="topbar-audio-toggle__label">{t("Метроном")}</span>
        </button>
      )}
    </>
  );
}
