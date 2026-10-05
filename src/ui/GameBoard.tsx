import { useI18n } from "../app/useI18n";
import { GAME_RULES } from "../practice/gameRules";
import type { GameScoreSnapshot } from "../practice/gameScore";
import type { PracticeMode } from "../practice/session";

interface Props {
  readonly game?: GameScoreSnapshot | undefined;
  readonly mode: PracticeMode;
  readonly playing: boolean;
  readonly onOverdrive: () => void;
}

export function GameBoard({ game, mode, playing, onOverdrive }: Props) {
  const { t, formatNumber } = useI18n();
  if (mode === "wait") {
    return (
      // A computer's bar says this in its timing chip; the plaque stays for the compact bar.
      <aside className="game-score-board game-score-board--message game-score-board--practice">
        {t("Тренировка · без рейтинга времени")}
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
      className="game-score-board"
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
        <span className="game-flow" title={t("20 идеальных или отличных попаданий подряд")}>
          {t("Поток")}
        </span>
      </section>
      <section className="game-hud__points" aria-label={t("Очки и точность")}>
        <span className="game-score-label">{t("Очки")}</span>
        <strong className="game-points" title={t("Игровой счёт")}>
          {formatNumber(game.score)}
        </strong>
        <span className="game-accuracy">
          {game.accuracy === null
            ? "—"
            : `${formatNumber(game.accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
        </span>
      </section>
      <section className="game-hud__energy" aria-label={t("Энергия и Overdrive")}>
        <div
          className="game-energy"
          title={t(
            "Энергия за каждую засчитанную ноту: два заряда в короткой композиции, три в обычной; прибавка рассчитана по выбранной партии"
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
          title={t("Удвоить множитель на 10 секунд за 50 энергии: кнопка, клавиша 0 или педаль")}
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
