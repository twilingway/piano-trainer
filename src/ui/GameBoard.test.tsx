import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

import { GameScore } from "../practice/gameScore";
import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import type { StaffPrefs } from "../app/useStaffPrefs";
import { DEFAULT_CAMERA } from "../render/worldCamera";
import { GameBoard } from "./GameBoard";
import { ResultDialog } from "./ResultDialog";
import { Workspace } from "./Workspace";

vi.mock("../staff/Staff", () => ({ Staff: () => null }));

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

  it("shows the scorer's combo, accuracy, grade counts and uncapped energy", () => {
    const score = new GameScore(62);
    for (let index = 0; index < 60; index++) score.hit(String(index), 0, index * 0.1);
    score.hit("good", 90, 6);
    score.miss("miss");
    const game = score.snapshot(7);
    const markup = renderToStaticMarkup(
      <GameBoard mode="tempo" playing onOverdrive={vi.fn()} game={game} />
    );
    expect(markup).toContain('class="game-combo__value">0</strong>');
    expect(markup).toContain(`${(game.accuracy ?? 0).toFixed(1)}%`);
    expect(markup).toContain('data-grade="PERFECT"');
    expect(markup).toContain("<dd>60</dd>");
    expect(markup).toContain("<strong>122</strong>");
    expect(markup).toContain('aria-valuenow="122"');
    expect(markup).toContain('style="width:100%"');
    expect(markup).not.toContain('disabled=""');
  });

  it("keeps Overdrive disabled when playback is paused even with enough energy", () => {
    const score = new GameScore(25);
    for (let index = 0; index < 25; index++) score.hit(String(index), 0, index * 0.1);
    const markup = renderToStaticMarkup(
      <GameBoard mode="tempo" playing={false} onOverdrive={vi.fn()} game={score.snapshot(3)} />
    );
    expect(markup).toContain('disabled=""');
  });

  it("fills the energy meter at the activation threshold", () => {
    const score = new GameScore(25);
    for (let index = 0; index < 25; index++) score.hit(String(index), 0, index);
    const markup = renderToStaticMarkup(
      <GameBoard mode="tempo" playing onOverdrive={vi.fn()} game={score.snapshot(25)} />
    );
    expect(markup).toContain('aria-valuemax="50"');
    expect(markup).toContain('aria-valuenow="50"');
    expect(markup).toContain('style="width:100%"');
  });

  it.each([true, false])("keeps the score and Overdrive outside the lane (visible: %s)", (lane) => {
    const prefs: StaffPrefs = {
      zoom: 1,
      noteColor: "#00d4ff",
      scoreColor: "#ffffff",
      singleLine: true,
      follow: true,
      measuresPerLine: 4,
      noteNames: "off",
      chords: false,
      fingers: true,
      fingerColors: "mono",
      visible: true,
      lane,
      keys: false,
      hands: false,
      road: true,
      noteCards: false,
      noteCardsConfigured: false,
      labels: true,
      fps: false,
      keyRange: "song",
      keyStyle: "arcade",
      autoReview: false,
      roadFar: 0.5,
      camera: DEFAULT_CAMERA,
      roadHorizon: 0.2
    };
    const markup = renderToStaticMarkup(
      <Workspace
        prefs={prefs}
        staffXml={undefined}
        fixedLines={false}
        beat={0}
        liveBeat={() => 0}
        onSeek={vi.fn()}
        reviewMarks={undefined}
        transcription={undefined}
        takeStaff="row"
        splitDirection="row"
        comparing={false}
        waiting={false}
        hostRef={{ current: null }}
        mirrorHostRef={{ current: null }}
        layout={DEFAULT_SCREEN_LAYOUT}
        onLayout={vi.fn()}
        onZoom={vi.fn()}
        onResetLayout={vi.fn()}
        layoutMoved={false}
        gameBoard={
          <GameBoard
            mode="tempo"
            playing
            onOverdrive={vi.fn()}
            game={new GameScore(1).snapshot(0)}
          />
        }
      />
    );
    const window = new Window();
    window.document.body.innerHTML = markup;
    expect(window.document.querySelector(".lanes .game-score-board")).toBeNull();
    expect(window.document.querySelectorAll(".game-score-board")).toHaveLength(1);
    expect(window.document.querySelector(".game-score-dock .game-overdrive")).not.toBeNull();
    window.close();
  });
});
