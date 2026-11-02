import { useI18n } from "../../app/useI18n";
import { PauseIcon, PlayIcon } from "../icons";

interface Props {
  readonly playing: boolean;
  readonly countdown: number | null;
  readonly loading: boolean;
  readonly blocked: boolean;
  readonly onToggle: () => void;
}

/** Reuses the song transport while keeping the active settings section in view. */
export function SettingsTransport({ playing, countdown, loading, blocked, onToggle }: Props) {
  const { t, formatNumber } = useI18n();
  const preparing = countdown !== null;
  const label = preparing
    ? countdown === 0
      ? t("Отменить запуск")
      : t("Отменить отсчёт")
    : playing
      ? t("Пауза")
      : loading
        ? t("Звук…")
        : t("Играть");
  return (
    <div
      className="settings-transport"
      role="group"
      aria-label={t("Управление песней в настройках")}
    >
      {preparing && countdown > 0 && (
        <span
          className="settings-transport__count"
          role="status"
          aria-label={t("До начала: {seconds}", { seconds: formatNumber(countdown) })}
        >
          {formatNumber(countdown)}
        </span>
      )}
      <button
        type="button"
        className="game-button settings-transport__toggle"
        aria-label={label}
        title={label}
        disabled={!playing && !preparing && (loading || blocked)}
        onClick={onToggle}
      >
        {playing || preparing ? <PauseIcon /> : <PlayIcon />}
        <span className="settings-transport__label">{label}</span>
      </button>
    </div>
  );
}
