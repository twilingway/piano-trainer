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
  if (!open) return null;
  const played = stats ? stats.hits + stats.misses : 0;
  const game = stats?.game;
  const accuracy = game ? game.accuracy : stats && played > 0 ? (stats.hits / played) * 100 : null;
  return (
    <GameDialog open={open} title="Готово" className="result" onClose={onClose}>
      {game && game.stars !== null ? (
        <p
          className="result-stars"
          role="img"
          aria-label={`Звёзды: ${String(game.stars)} из 3`}
          title="1 звезда: точность выше 25%; 2: выше 50%; 3: выше 75%"
        >
          <span aria-hidden="true">{"★".repeat(game.stars)}</span>
          <span className="result-stars-empty" aria-hidden="true">
            {"☆".repeat(3 - game.stars)}
          </span>
        </p>
      ) : null}
      <div className="result-summary">
        {game && game.expectedNotes > 0 ? (
          <p className="result-points digits">Очки {game.score}</p>
        ) : (
          <p>{game ? "Нет нот для оценки" : "Тренировка · без рейтинга"}</p>
        )}
      </div>
      <div className="result-details">
        <p className="result-score digits">
          {accuracy === null ? "Нет нот для оценки" : `${accuracy.toFixed(1)}%`}
        </p>
        <p className="result-caption">
          {game ? "взвешенная точность" : "Тренировка · без рейтинга времени"}
        </p>
        {game && game.expectedNotes > 0 && (
          <div className="game-result-details">
            <p>
              Очки <strong>{game.score}</strong> · Ранг <strong>{game.rank}</strong>
            </p>
            <p>Эталон: {game.targetScore} очков (идеальная игра без Overdrive)</p>
            <p>
              Максимальная серия: {game.maxCombo} · Нот: {game.expectedNotes}
              {game.perfectFullCombo
                ? " · Идеальное Full Combo"
                : game.fullCombo
                  ? " · Full Combo"
                  : ""}
            </p>
            <dl className="game-result-stats">
              <dt>Идеально / Отлично / Хорошо / Зачтено / Пропущено</dt>
              <dd>
                {game.grades.PERFECT} / {game.grades.GREAT} / {game.grades.GOOD} / {game.grades.OK}{" "}
                / {game.grades.MISS}
              </dd>
              <dt>Лишние клавиши</dt>
              <dd>{game.wrong}</dd>
              <dt>Аккорды: полные / частичные</dt>
              <dd>
                {game.chords - game.partialChords} / {game.partialChords}
              </dd>
              <dt>Средняя / медианная ошибка</dt>
              <dd>
                {milliseconds(game.timing.meanMs)} / {milliseconds(game.timing.medianMs)}
              </dd>
              <dt>Рано / Поздно / Точно в момент</dt>
              <dd>
                {game.timing.early} / {game.timing.late} / {game.timing.exact}
              </dd>
              <dt>Очки удержания / бонус Overdrive</dt>
              <dd>
                {game.holdScore} / {game.overdriveScore}
              </dd>
              {stats.hold && (
                <>
                  <dt>Точность удержания</dt>
                  <dd>
                    {stats.hold.accuracy === null ? "—" : `${stats.hold.accuracy.toFixed(1)}%`}
                    {" · "}
                    {stats.hold.heldSeconds.toFixed(2)} / {stats.hold.possibleSeconds.toFixed(2)} с
                  </dd>
                  <dt>Отпущено нот · средняя / медианная ошибка отпускания</dt>
                  <dd>
                    {stats.hold.releasedNotes} · {milliseconds(stats.hold.meanReleaseOffsetMs)} /{" "}
                    {milliseconds(stats.hold.medianReleaseOffsetMs)}
                  </dd>
                </>
              )}
            </dl>
            {game.timing.histogram.length > 0 && (
              <details>
                <summary>Распределение ошибки времени</summary>
                <ul className="timing-histogram">
                  {game.timing.histogram.map(({ fromMs, count }) => (
                    <li key={fromMs}>
                      {fromMs}…{fromMs + 10} мс: {count}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {stats && stats.troubleSpots.length > 0 && (
          <p>
            Трудные ноты:{" "}
            {stats.troubleSpots
              .map((spot) => `${noteLabel(spot.pitch)} (${String(spot.errors)})`)
              .join(", ")}
          </p>
        )}
      </div>
      <div className="result-actions">
        <button type="button" className="game-button game-button--play" onClick={onAgain}>
          Ещё раз
        </button>
        {canReview && (
          <button type="button" className="game-button result-review-action" onClick={onReview}>
            Разобрать дубль
          </button>
        )}
        <button type="button" className="game-button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </GameDialog>
  );
}

function milliseconds(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)} мс`;
}
