import type { PracticeMode, PracticeStats } from "../../practice/session";

interface Props {
  readonly metronome: boolean;
  readonly onMetronome: (on: boolean) => void;
  readonly listening: boolean;
  readonly soundLoading: boolean;
  readonly onListen: () => void;
  readonly stats: PracticeStats | undefined;
  readonly mode: PracticeMode;
}

/** The play tab: the metronome, a listen-through and the counts of the run. */
export function PlaySettings({
  metronome,
  onMetronome,
  listening,
  soundLoading,
  onListen,
  stats,
  mode
}: Props) {
  return (
    <div className="settings-list">
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
