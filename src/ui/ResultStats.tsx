import { useI18n } from "../app/useI18n";
import type { PracticeStats } from "../practice/session";
import { GameDialog } from "./GameDialog";
import { TroubleNotes } from "./ResultDialog";

interface Props {
  /** The finished take's stats, copied when the panel opened. */
  readonly stats: PracticeStats;
  /** The take has a review to open. */
  readonly canReview: boolean;
  readonly onClose: () => void;
  readonly onAgain: () => void;
  readonly onReview: () => void;
}

/** The details of a finished run, beside the game, so the review stays in view. */
export function ResultStats({ stats, canReview, onClose, onAgain, onReview }: Props) {
  const { t, formatNumber } = useI18n();
  const milliseconds = (value: number | null): string =>
    value === null
      ? "—"
      : `${value > 0 ? "+" : ""}${formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t("мс")}`;
  const game = stats.game;
  const result = stats.noteResult;
  return (
    <GameDialog
      open
      title={t("Статистика")}
      className="result-stats"
      modal={false}
      onClose={onClose}
    >
      {game && (
        <div className="game-result-details">
          {result && game.accuracy !== null && (
            <p>
              {t("Точность попадания: {percent}%", {
                percent: formatNumber(game.accuracy, { maximumFractionDigits: 1 })
              })}
            </p>
          )}
          <p>
            {t("Очки")} <strong>{formatNumber(game.score)}</strong>{" "}
            {result ? t("· Ранг по времени") : t("· Ранг")} <strong>{game.rank}</strong>
          </p>
          <p>
            {t("Максимум:")} {formatNumber(game.targetScore)}{" "}
            {t("очков (идеальная игра без Overdrive)")}
          </p>
          <p>
            {t("Максимальная серия:")} {formatNumber(game.maxCombo)} {t("· Нот:")}{" "}
            {formatNumber(game.expectedNotes)}
            {game.perfectFullCombo
              ? t(" · Идеальное Full Combo")
              : game.fullCombo
                ? " · Full Combo"
                : ""}
          </p>
          <dl className="game-result-stats">
            <dt>{t("Идеально / Отлично / Хорошо / Зачтено / Пропущено")}</dt>
            <dd>
              {formatNumber(game.grades.PERFECT)} / {formatNumber(game.grades.GREAT)} /{" "}
              {formatNumber(game.grades.GOOD)} / {formatNumber(game.grades.OK)} /{" "}
              {formatNumber(game.grades.MISS)}
            </dd>
            <dt>{t("Лишние клавиши")}</dt>
            <dd>{formatNumber(game.wrong)}</dd>
            <dt>{t("Аккорды: полные / частичные")}</dt>
            <dd>
              {formatNumber(game.chords - game.partialChords)} / {formatNumber(game.partialChords)}
            </dd>
            <dt>{t("Средняя / медианная ошибка")}</dt>
            <dd>
              {milliseconds(game.timing.meanMs)} / {milliseconds(game.timing.medianMs)}
            </dd>
            <dt>{t("Рано / Поздно / Вовремя")}</dt>
            <dd>
              {formatNumber(game.timing.early)} / {formatNumber(game.timing.late)} /{" "}
              {formatNumber(game.timing.exact)}
            </dd>
            <dt>{t("Очки удержания / бонус Overdrive")}</dt>
            <dd>
              {formatNumber(game.holdScore)} / {formatNumber(game.overdriveScore)}
            </dd>
            {stats.hold && (
              <>
                <dt>{t("Точность удержания")}</dt>
                <dd>
                  {stats.hold.accuracy === null
                    ? "—"
                    : `${formatNumber(stats.hold.accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                  {" · "}
                  {formatNumber(stats.hold.heldSeconds, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}{" "}
                  /{" "}
                  {formatNumber(stats.hold.possibleSeconds, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}{" "}
                  {t("с")}
                </dd>
                <dt>{t("Отпущено нот · средняя / медианная ошибка отпускания")}</dt>
                <dd>
                  {formatNumber(stats.hold.releasedNotes)} ·{" "}
                  {milliseconds(stats.hold.meanReleaseOffsetMs)} /{" "}
                  {milliseconds(stats.hold.medianReleaseOffsetMs)}
                </dd>
              </>
            )}
          </dl>
          {game.timing.histogram.length > 0 && (
            <details>
              <summary>{t("Распределение ошибки времени")}</summary>
              <ul className="timing-histogram">
                {game.timing.histogram.map(({ fromMs, count }) => (
                  <li key={fromMs}>
                    {formatNumber(fromMs)}…{formatNumber(fromMs + 10)} {t("мс:")}{" "}
                    {formatNumber(count)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {/* A phone's «Готово» has no room for them: they are read here. */}
      <TroubleNotes stats={stats} className="result-stats-trouble" />
      <div className="result-actions">
        <button type="button" className="game-button game-button--play" onClick={onAgain}>
          {t("Ещё раз")}
        </button>
        {canReview && (
          <button type="button" className="game-button result-review-action" onClick={onReview}>
            {t("Разобрать дубль")}
          </button>
        )}
        <button type="button" className="game-button" onClick={onClose}>
          {t("Закрыть")}
        </button>
      </div>
    </GameDialog>
  );
}
