import { useI18n } from "../../app/useI18n";
import type { PracticeMode, PracticeStats } from "../../practice/session";
import type { HandsChoice } from "../PlayerTopBar";

interface Props {
  readonly wordTyping?: boolean;
  readonly metronome: boolean;
  readonly onMetronome: (on: boolean) => void;
  readonly listening: boolean;
  readonly soundLoading: boolean;
  readonly onListen: () => void;
  readonly stats: PracticeStats | undefined;
  readonly mode: PracticeMode;
  readonly onMode: (mode: PracticeMode) => void;
  readonly hands: HandsChoice;
  readonly onHands: (hands: HandsChoice) => void;
  readonly speed: number;
  readonly onSpeed: (speed: number) => void;
  readonly autoReview: boolean;
  readonly onAutoReview: (on: boolean) => void;
}

/** The play tab: the metronome, a listen-through and the counts of the run. */
export function PlaySettings({
  metronome,
  onMetronome,
  listening,
  soundLoading,
  onListen,
  stats,
  mode,
  onMode,
  hands,
  onHands,
  speed,
  onSpeed,
  autoReview,
  onAutoReview,
  wordTyping = false
}: Props) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="settings-list">
      <label className="setting">
        <span>{t("Режим")}</span>
        <select
          className="game-select"
          aria-label={t("Режим")}
          value={mode}
          onChange={(event) => {
            onMode(event.target.value as PracticeMode);
          }}
        >
          <option value="wait">{t("Ждать ноту")}</option>
          <option value="tempo">{t("В темпе")}</option>
        </select>
      </label>
      {!wordTyping && (
        <label className="setting">
          <span>{t("Руки")}</span>
          <select
            className="game-select"
            aria-label={t("Руки")}
            value={hands}
            onChange={(event) => {
              onHands(event.target.value as HandsChoice);
            }}
          >
            <option value="right">{t("Правая рука")}</option>
            <option value="left">{t("Левая рука")}</option>
            <option value="both">{t("Обе руки")}</option>
            <option value="listen">{t("Только слушать")}</option>
          </select>
        </label>
      )}
      <label className="setting">
        <span>{t("Скорость")}</span>
        <span className="setting-control">
          <input
            type="range"
            aria-label={t("Скорость")}
            min={0.01}
            max={1}
            step={0.01}
            value={speed}
            onChange={(event) => {
              onSpeed(Number(event.target.value));
            }}
          />
          <span className="digits">{Math.round(speed * 100)}%</span>
        </span>
      </label>
      <label className="setting">
        <span>{t("Метроном")}</span>
        <input
          type="checkbox"
          checked={metronome}
          onChange={(event) => {
            onMetronome(event.target.checked);
          }}
        />
      </label>
      <label className="setting">
        <span>{t("Открывать разбор после игры")}</span>
        <input
          type="checkbox"
          checked={autoReview}
          onChange={(event) => {
            onAutoReview(event.target.checked);
          }}
        />
      </label>
      <div className="setting">
        <span>{t("Послушать, как звучит песня")}</span>
        <button type="button" className="game-button" onClick={onListen} disabled={soundLoading}>
          {listening ? t("Стоп") : t("Прослушать")}
        </button>
      </div>
      {stats && (
        <p className="setting-hint">
          {t("Попадания {hits} · Промахи {misses} · Лишние {wrong}", {
            hits: formatNumber(stats.hits),
            misses: formatNumber(stats.misses),
            wrong: formatNumber(stats.wrong)
          })}
          {mode === "tempo" && stats.hits > 0
            ? t(" · Смещение {offset} мс", {
                offset: formatNumber(Math.round(stats.meanOffset * 1000))
              })
            : ""}
        </p>
      )}
      <p className="setting-hint">{t("Ctrl+Пробел — играть и пауза.")}</p>
    </div>
  );
}
