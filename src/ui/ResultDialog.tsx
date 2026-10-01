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
  const played = stats ? stats.hits + stats.misses : 0;
  const accuracy = stats && played + stats.wrong > 0 ? stats.hits / (played + stats.wrong) : 0;
  return (
    <GameDialog open={open} title="Готово" className="result" onClose={onClose}>
      <p className="result-score digits">{Math.round(accuracy * 100)}%</p>
      <p className="result-caption">точность</p>
      {stats && stats.troubleSpots.length > 0 && (
        <p>
          Трудные ноты:{" "}
          {stats.troubleSpots
            .map((spot) => `${noteLabel(spot.pitch)} (${String(spot.errors)})`)
            .join(", ")}
        </p>
      )}
      <div className="result-actions">
        <button type="button" className="game-button game-button--play" onClick={onAgain}>
          Ещё раз
        </button>
        {canReview && (
          <button type="button" className="game-button" onClick={onReview}>
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
