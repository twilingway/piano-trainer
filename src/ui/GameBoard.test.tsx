import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GameScore } from "../practice/gameScore";
import { GameBoard } from "./GameBoard";
import { ResultDialog } from "./ResultDialog";

describe("game score presentation", () => {
  it("does not offer ranked score or Overdrive in wait mode", () => {
    const markup = renderToStaticMarkup(
      <GameBoard mode="wait" playing onOverdrive={vi.fn()} game={new GameScore(1).snapshot(0)} />
    );
    expect(markup).toContain("без рейтинга времени");
    expect(markup).not.toContain("Overdrive");
  });

  it("disables Overdrive before sufficient energy and enables after 25 perfect notes", () => {
    const score = new GameScore(25);
    const board = () =>
      renderToStaticMarkup(
        <GameBoard mode="tempo" playing onOverdrive={vi.fn()} game={score.snapshot(3)} />
      );
    expect(board()).toContain('disabled=""');
    for (let index = 0; index < 25; index++) score.hit(String(index), 0, index * 0.1);
    expect(board()).not.toContain('disabled=""');
    score.activateOverdrive(3);
    expect(board()).toContain('disabled=""');
    expect(board()).toContain("Overdrive активен");
  });

  it("renders weighted results and shows no rating for an empty assessed part", () => {
    const score = new GameScore(2, { targetScore: 200 });
    score.hit("a", -10, 0);
    score.hit("b", 90, 1);
    const render = (game: ReturnType<GameScore["snapshot"]>) =>
      renderToStaticMarkup(
        <ResultDialog
          open
          stats={{ hits: 2, misses: 0, wrong: 0, meanOffset: 0, troubleSpots: [], game }}
          canReview={false}
          onClose={vi.fn()}
          onAgain={vi.fn()}
          onReview={vi.fn()}
        />
      );
    expect(render(score.snapshot(1))).toContain("75.0%");
    expect(render(score.snapshot(1))).toContain("идеальная игра без Overdrive");
    expect(render(score.snapshot(1))).toContain("Распределение ошибки времени");
    const empty = render(new GameScore(0).snapshot(0));
    expect(empty).toContain("Нет нот для оценки");
    expect(empty).not.toContain("Ранг");
  });
});
