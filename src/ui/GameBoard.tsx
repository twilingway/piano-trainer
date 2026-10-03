import { GAME_RULES, type Judgement } from "../practice/gameRules";
import type { GameScoreSnapshot } from "../practice/gameScore";
import type { PracticeMode } from "../practice/session";

interface Props {
  readonly game?: GameScoreSnapshot | undefined;
  readonly mode: PracticeMode;
  readonly playing: boolean;
  readonly onOverdrive: () => void;
}

const GRADES: readonly { grade: Judgement; label: string }[] = [
  { grade: "PERFECT", label: "Идеально" },
  { grade: "GREAT", label: "Отлично" },
  { grade: "GOOD", label: "Хорошо" },
  { grade: "OK", label: "Зачтено" },
  { grade: "MISS", label: "Пропуск" }
];
const scoreFormat = new Intl.NumberFormat("ru-RU");

export function GameBoard({ game, mode, playing, onOverdrive }: Props) {
  if (mode === "wait") {
    return (
      <aside className="game-score-board game-score-board--message">
        Тренировка · без рейтинга времени
      </aside>
    );
  }
  if (!game || game.expectedNotes === 0) {
    return <aside className="game-score-board game-score-board--message">Нет нот для оценки</aside>;
  }
  return (
    <aside
      className="game-score-board"
      aria-label="Игровой счёт"
      data-overdrive={game.overdriveActive}
    >
      <section className="game-score-panel game-score-panel--combo" aria-label="Серия и точность">
        <div className="game-combo">
          <span className="game-score-label">Комбо</span>
          <strong className="game-combo__value">{game.combo}</strong>
        </div>
        <div className="game-accuracy">
          <span className="game-score-label">Точность</span>
          <strong>{game.accuracy === null ? "—" : `${game.accuracy.toFixed(1)}%`}</strong>
        </div>
        <dl className="game-grades" aria-label="Оценки попаданий">
          {GRADES.map(({ grade, label }) => (
            <div key={grade} data-grade={grade}>
              <dt>
                <span className="game-grade-light" />
                {label}
              </dt>
              <dd>{game.grades[grade]}</dd>
            </div>
          ))}
        </dl>
        {game.flow && (
          <span className="game-flow" title="20 идеальных или отличных попаданий подряд">
            Поток
          </span>
        )}
      </section>
      <section className="game-score-panel game-score-panel--points" aria-label="Очки и энергия">
        <div className="game-points">
          <span className="game-score-label">Очки</span>
          <strong title="Игровой счёт">{scoreFormat.format(game.score)}</strong>
        </div>
        <div className="game-multiplier" title="Множитель серии">
          <strong>×{game.multiplier}</strong>
          <span>Множитель</span>
        </div>
        <div
          className="game-energy"
          title="Энергия за точные попадания: до трёх зарядов за композицию; отлично даёт половину идеального"
        >
          <div>
            <span className="game-score-label">Энергия</span>
            <strong>{game.energy}</strong>
          </div>
          <div
            className="game-energy__track"
            role="meter"
            aria-label="Запас энергии"
            aria-valuemin={0}
            aria-valuemax={Math.max(GAME_RULES.overdriveCost, game.energy)}
            aria-valuenow={game.energy}
          >
            <span
              style={{
                width: `${String(Math.min(100, (Math.max(0, game.energy) / GAME_RULES.overdriveCost) * 100))}%`
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="game-button game-overdrive"
          title="Удвоить множитель на 10 секунд за 50 энергии"
          disabled={!playing || game.energy < GAME_RULES.overdriveCost || game.overdriveActive}
          onClick={onOverdrive}
        >
          {game.overdriveActive ? "Overdrive активен" : "Overdrive · 50"}
        </button>
      </section>
    </aside>
  );
}
