import type { GameScoreSnapshot } from "../practice/gameScore";
import type { PracticeMode } from "../practice/session";

interface Props {
  readonly game?: GameScoreSnapshot | undefined;
  readonly mode: PracticeMode;
  readonly playing: boolean;
  readonly onOverdrive: () => void;
}

export function GameBoard({ game, mode, playing, onOverdrive }: Props) {
  if (mode === "wait") {
    return <aside className="game-score-board">Тренировка · без рейтинга времени</aside>;
  }
  if (!game || game.expectedNotes === 0) {
    return <aside className="game-score-board">Нет нот для оценки</aside>;
  }
  return (
    <aside className="game-score-board" aria-label="Игровой счёт">
      <span className="digits" title="Игровой счёт">
        Очки {game.score}
      </span>
      <span title="Множитель серии">×{game.multiplier}</span>
      <span title="Энергия: идеально +2, отлично +1">Энергия {game.energy}</span>
      {game.flow && <span title="20 идеальных или отличных попаданий подряд">Flow</span>}
      <button
        type="button"
        className="game-button game-overdrive"
        title="Удвоить множитель на 10 секунд за 50 энергии"
        disabled={!playing || game.energy < 50 || game.overdriveActive}
        onClick={onOverdrive}
      >
        {game.overdriveActive ? "Overdrive активен" : "Overdrive · 50"}
      </button>
    </aside>
  );
}
