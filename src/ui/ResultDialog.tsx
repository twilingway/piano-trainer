import { useI18n } from "../app/useI18n";
import type { PracticeStats } from "../practice/session";
import { COURSE_PASS_PERCENT } from "../course/model";
import { starsForNoteResult } from "../practice/gameResults";
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

/** The notes that went wrong most, with their error counts. */
export function TroubleNotes({
  stats,
  className
}: {
  readonly stats: PracticeStats;
  readonly className?: string;
}) {
  const { t, formatNumber } = useI18n();
  if (stats.troubleSpots.length === 0) return null;
  return (
    <p className={className}>
      {t("Трудные ноты:")}{" "}
      {stats.troubleSpots
        .map((spot) => `${noteLabel(spot.pitch)} (${formatNumber(spot.errors)})`)
        .join(", ")}
    </p>
  );
}

interface Props {
  readonly open: boolean;
  readonly stats: PracticeStats | undefined;
  /** The take has a review to open. */
  readonly canReview: boolean;
  readonly onClose: () => void;
  readonly onAgain: () => void;
  readonly onReview: () => void;
  /** Opens the details of the run beside the game. */
  readonly onStats: (stats: PracticeStats) => void;
  readonly onNext?: () => void;
  readonly course?: boolean;
}

/** The end of a run: the accuracy, the notes that went wrong most, and what next. */
export function ResultDialog({
  open,
  stats,
  canReview,
  onClose,
  onAgain,
  onReview,
  onStats,
  onNext,
  course = false
}: Props) {
  const { t, formatNumber } = useI18n();
  if (!open) return null;
  const played = stats ? stats.hits + stats.misses : 0;
  const game = stats?.game;
  const result = stats?.noteResult;
  const stars = result ? starsForNoteResult(result) : (game?.stars ?? null);
  const accuracy = result
    ? result.percent
    : game
      ? game.accuracy
      : stats && played > 0
        ? (stats.hits / played) * 100
        : null;
  return (
    <GameDialog open={open} title={t("Готово")} className="result" onClose={onClose}>
      {stars !== null ? (
        <p
          className="result-stars"
          role="img"
          aria-label={t("Звёзды: {stars} из 3", { stars: String(stars) })}
          title={
            result
              ? t("1 звезда: результат от 25%; 2: от 50%; 3: от 75%")
              : t("1 звезда: точность выше 25%; 2: выше 50%; 3: выше 75%")
          }
        >
          <span aria-hidden="true">{"★".repeat(stars)}</span>
          <span className="result-stars-empty" aria-hidden="true">
            {"☆".repeat(3 - stars)}
          </span>
        </p>
      ) : null}
      {result && stars !== null && (
        <p className="result-caption">{t("Звёзды за попадания и удержание")}</p>
      )}
      <div className="result-summary">
        {game && game.expectedNotes > 0 ? (
          <p className="result-points digits">
            {t("Очки")} {formatNumber(game.score)}
          </p>
        ) : (
          <p>
            {game && !result?.expectedNotes
              ? t("Нет нот для оценки")
              : t("Тренировка · без рейтинга")}
          </p>
        )}
        <p className="result-score digits">
          {accuracy === null
            ? t("Нет нот для оценки")
            : `${formatNumber(accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
        </p>
        <p className="result-caption">
          {result
            ? t("Попадания — 30%, удержание — 70%")
            : game
              ? t("взвешенная точность")
              : t("Тренировка · без рейтинга времени")}
        </p>
        {result?.percent != null && (
          <>
            <p>
              {t("За попадания: {percent}% из 30%", {
                percent: formatNumber(result.hitPercent, { maximumFractionDigits: 1 })
              })}
            </p>
            <p>
              {t("За удержание: {percent}% из 70%", {
                percent: formatNumber(result.holdPercent, { maximumFractionDigits: 1 })
              })}
            </p>
            {course && (
              <p>
                {result.percent >= COURSE_PASS_PERCENT
                  ? t("Порог 75% достигнут")
                  : t("Для зачёта нужно не меньше 75%. Удерживайте клавиши до конца нот.")}
              </p>
            )}
          </>
        )}
      </div>
      <div className="result-details">{stats && <TroubleNotes stats={stats} />}</div>
      <div className="result-actions">
        {onNext && (
          <button type="button" className="game-button game-button--play" onClick={onNext}>
            {t("Следующее задание")}
          </button>
        )}
        <button type="button" className="game-button game-button--play" onClick={onAgain}>
          {t("Ещё раз")}
        </button>
        {canReview && (
          <button type="button" className="game-button result-review-action" onClick={onReview}>
            {t("Разобрать дубль")}
          </button>
        )}
        {stats && game && game.expectedNotes > 0 && (
          <button
            type="button"
            className="game-button"
            onClick={() => {
              onStats(stats);
            }}
          >
            {t("Статистика")}
          </button>
        )}
        <button type="button" className="game-button" onClick={onClose}>
          {t("Закрыть")}
        </button>
      </div>
    </GameDialog>
  );
}
