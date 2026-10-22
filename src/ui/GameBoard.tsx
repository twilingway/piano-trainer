import { useI18n } from "../app/useI18n";
import { GAME_RULES } from "../practice/gameRules";
import type { GameScoreSnapshot } from "../practice/gameScore";
import type { PracticeMode } from "../practice/session";
import type { NoteResultSnapshot } from "../practice/noteResult";

interface Props {
  readonly game?: GameScoreSnapshot | undefined;
  readonly noteResult?: NoteResultSnapshot | undefined;
  readonly mode: PracticeMode;
  readonly playing: boolean;
  readonly onOverdrive: () => void;
}

export function GameBoard({ game, noteResult, mode, playing, onOverdrive }: Props) {
  const { t, formatNumber } = useI18n();
  const result = noteResult ? noteResult.percent : game?.accuracy;
  const resultText =
    result == null
      ? "—"
      : `${formatNumber(result, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (mode === "wait") {
    return (
      // A computer's bar says this in its timing chip; the plaque stays for the compact bar.
      <aside
        className={`game-score-board game-score-board--message game-score-board--practice${noteResult ? " game-score-board--note-result" : ""}`}
      >
        <span className="game-practice-label">{t("Тренировка · без рейтинга времени")}</span>
        {noteResult && (
          <span className="game-accuracy" title={t("Попадания — 30%, удержание — 70%")}>
            {resultText}
          </span>
        )}
      </aside>
    );
  }
  if (!game || game.expectedNotes === 0) {
    return (
      <aside className="game-score-board game-score-board--message">
        {t("Нет нот для оценки")}
      </aside>
    );
  }
  const cost = GAME_RULES.overdriveCost;
  const energy = Math.max(0, game.energy);
  const ready = energy >= cost && !game.overdriveActive;
  // While Overdrive runs the bar shows its time draining, not the energy.
  const fill = game.overdriveActive
    ? game.overdriveLeft / GAME_RULES.overdriveSeconds
    : Math.min(1, energy / cost);
  return (
    <aside
      className={`game-score-board${noteResult ? " game-score-board--note-result" : ""}`}
      aria-label={t("Игровой счёт")}
      data-overdrive={game.overdriveActive}
      data-ready={ready}
      data-flow={game.flow}
      data-broken={game.combo === 0 && game.judgedNotes > 0}
    >
      <section className="game-hud__combo" aria-label={t("Серия")}>
        <span className="game-score-label">{t("Комбо")}</span>
        <strong className="game-combo__value">{formatNumber(game.combo)}</strong>
        {/* A new key replays the pulse each time the multiplier changes. */}
        <strong key={game.multiplier} className="game-multiplier" title={t("Множитель серии")}>
          ×{game.multiplier}
        </strong>
        <span className="game-flow" title={t("20 нот подряд на «Идеально» или «Отлично»")}>
          {t("Поток")}
        </span>
      </section>
      <section className="game-hud__points" aria-label={t("Очки и точность")}>
        <span className="game-score-label">{t("Очки")}</span>
        <strong className="game-points" title={t("Игровой счёт")}>
          {formatNumber(game.score)}
        </strong>
        <span
          className="game-accuracy"
          title={noteResult ? t("Попадания — 30%, удержание — 70%") : t("взвешенная точность")}
        >
          {resultText}
        </span>
      </section>
      <section className="game-hud__energy" aria-label={t("Энергия и Overdrive")}>
        <div
          className="game-energy"
          title={t(
            "Энергия копится с каждой засчитанной нотой: в короткой пьесе её хватит на два Overdrive, в обычной — на три"
          )}
        >
          <span className="game-score-label">{t("Энергия")}</span>
          <strong className="game-energy__value">
            {formatNumber(Math.floor(energy))} / {formatNumber(cost)}
          </strong>
          <div
            className="game-energy__track"
            role="meter"
            aria-label={t("Запас энергии")}
            aria-valuemin={0}
            aria-valuemax={Math.max(cost, energy)}
            aria-valuenow={energy}
          >
            <span style={{ width: `${String(Math.max(0, fill) * 100)}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="game-button game-overdrive"
          title={t(
            "Overdrive за 50 энергии удваивает множитель на 10 секунд: кнопка, клавиша 0 или педаль"
          )}
          disabled={!playing || !ready}
          onClick={onOverdrive}
        >
          {game.overdriveActive
            ? t("Overdrive · {seconds} с", { seconds: formatNumber(Math.ceil(game.overdriveLeft)) })
            : "Overdrive"}
        </button>
        <small className="game-overdrive__hint">{t("0 · педаль")}</small>
      </section>
    </aside>
  );
}
