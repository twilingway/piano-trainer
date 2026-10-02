import type { PracticeMode, PracticeStats } from "../../practice/session";
import type { HandsChoice } from "../PlayerTopBar";

interface Props {
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
  onAutoReview
}: Props) {
  return (
    <div className="settings-list">
      <label className="setting">
        <span>Режим</span>
        <select
          className="game-select"
          aria-label="Режим"
          value={mode}
          onChange={(event) => {
            onMode(event.target.value as PracticeMode);
          }}
        >
          <option value="wait">Ждать ноту</option>
          <option value="tempo">В темпе</option>
        </select>
      </label>
      <label className="setting">
        <span>Руки</span>
        <select
          className="game-select"
          aria-label="Руки"
          value={hands}
          onChange={(event) => {
            onHands(event.target.value as HandsChoice);
          }}
        >
          <option value="right">Правая рука</option>
          <option value="left">Левая рука</option>
          <option value="both">Обе руки</option>
          <option value="listen">Только слушать</option>
        </select>
      </label>
      <label className="setting">
        <span>Скорость</span>
        <span className="setting-control">
          <input
            type="range"
            aria-label="Скорость"
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
        <span>Метроном</span>
        <input
          type="checkbox"
          checked={metronome}
          onChange={(event) => {
            onMetronome(event.target.checked);
          }}
        />
      </label>
      <label className="setting">
        <span>Открывать разбор после игры</span>
        <input
          type="checkbox"
          checked={autoReview}
          onChange={(event) => {
            onAutoReview(event.target.checked);
          }}
        />
      </label>
      <div className="setting">
        <span>Послушать, как звучит песня</span>
        <button type="button" className="game-button" onClick={onListen} disabled={soundLoading}>
          {listening ? "Стоп" : "Прослушать"}
        </button>
      </div>
      {stats && (
        <p className="setting-hint">
          Попадания {stats.hits} · Промахи {stats.misses} · Лишние {stats.wrong}
          {mode === "tempo" && stats.hits > 0
            ? ` · Смещение ${String(Math.round(stats.meanOffset * 1000))} мс`
            : ""}
        </p>
      )}
      <p className="setting-hint">
        Горячие клавиши: Ctrl+Пробел или Alt+P — играть и пауза, Alt+R — сначала, Alt+L —
        библиотека.
      </p>
    </div>
  );
}
