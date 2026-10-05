import { useI18n } from "../app/useI18n";
import type { PracticeStats } from "../practice/session";
import { GameDialog } from "./GameDialog";

const NOTE_NAMES = [
  "до",
  "до♯",
  "ре",
  "ре♯",
  "ми",
  "фа",
  "фа♯",
  "соль",
  "соль♯",
  "ля",
  "ля♯",
  "си"
];

function noteLabel(pitch: number): string {
  return `${NOTE_NAMES[pitch % 12] ?? "?"}${String(Math.floor(pitch / 12) - 1)}`;
}

interface Props {
  readonly open: boolean;
  readonly stats: PracticeStats | undefined;
  /** The take has a review to open. */
  readonly canReview: boolean;
  readonly onClose: () => void;
  readonly onAgain: () => void;
  readonly onReview: () => void;
}

/** The end of a run: the accuracy, the notes that went wrong most, and what next. */
export function ResultDialog({ open, stats, canReview, onClose, onAgain, onReview }: Props) {
  const { t, formatNumber } = useI18n();
  const milliseconds = (value: number | null): string =>
    value === null
      ? "—"
      : `${value > 0 ? "+" : ""}${formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t("мс")}`;
  if (!open) return null;
  const played = stats ? stats.hits + stats.misses : 0;
  const game = stats?.game;
  const accuracy = game ? game.accuracy : stats && played > 0 ? (stats.hits / played) * 100 : null;
  return (
    <GameDialog open={open} title={t("Готово")} className="result" onClose={onClose}>
      {game && game.stars !== null ? (
        <p
          className="result-stars"
          role="img"
          aria-label={t("Звёзды: {stars} из 3", { stars: String(game.stars) })}
          title={t("1 звезда: точность выше 25%; 2: выше 50%; 3: выше 75%")}
        >
          <span aria-hidden="true">{"★".repeat(game.stars)}</span>
          <span className="result-stars-empty" aria-hidden="true">
            {"☆".repeat(3 - game.stars)}
          </span>
        </p>
      ) : null}
      <div className="result-summary">
        {game && game.expectedNotes > 0 ? (
          <p className="result-points digits">
            {t("Очки")} {formatNumber(game.score)}
          </p>
        ) : (
          <p>{game ? t("Нет нот для оценки") : t("Тренировка · без рейтинга")}</p>
        )}
      </div>
      <div className="result-details">
        <p className="result-score digits">
          {accuracy === null
            ? t("Нет нот для оценки")
            : `${formatNumber(accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
        </p>
        <p className="result-caption">
          {game ? t("взвешенная точность") : t("Тренировка · без рейтинга времени")}
        </p>
        {game && game.expectedNotes > 0 && (
          <div className="game-result-details">
            <p>
              {t("Очки")} <strong>{formatNumber(game.score)}</strong> {t("· Ранг")}{" "}
              <strong>{game.rank}</strong>
            </p>
            <p>
              {t("Эталон:")} {formatNumber(game.targetScore)}{" "}
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
                {formatNumber(game.chords - game.partialChords)} /{" "}
                {formatNumber(game.partialChords)}
              </dd>
              <dt>{t("Средняя / медианная ошибка")}</dt>
              <dd>
                {milliseconds(game.timing.meanMs)} / {milliseconds(game.timing.medianMs)}
              </dd>
              <dt>{t("Рано / Поздно / Точно в момент")}</dt>
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
        {stats && stats.troubleSpots.length > 0 && (
          <p>
            {t("Трудные ноты:")}{" "}
            {stats.troubleSpots
              .map((spot) => `${noteLabel(spot.pitch)} (${formatNumber(spot.errors)})`)
              .join(", ")}
          </p>
        )}
      </div>
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
