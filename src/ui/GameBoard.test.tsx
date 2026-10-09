// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GameScore } from "../practice/gameScore";
import { NOTE_RESULT_POLICY, type NoteResultSnapshot } from "../practice/noteResult";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { DEFAULT_SCREEN_LAYOUT } from "../app/screenLayout";
import type { StaffPrefs } from "../app/useStaffPrefs";
import { DEFAULT_CAMERA } from "../render/worldCamera";
import { GameBoard } from "./GameBoard";
import { ResultDialog } from "./ResultDialog";
import { Workspace } from "./Workspace";

vi.mock("../staff/Staff", () => ({ Staff: () => null }));

beforeEach(() => {
  setInterfaceLanguage("ru");
});

const prefsWith = (lane: boolean): StaffPrefs => ({
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
  handStyle: "drawn",
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
});

describe("game score presentation", () => {
  it("shows the shared note result instead of attack accuracy, including waiting practice", () => {
    const score = new GameScore(1);
    score.hit("a", 0, 0);
    const noteResult: NoteResultSnapshot = {
      policy: NOTE_RESULT_POLICY,
      expectedNotes: 1,
      hitNotes: 1,
      hitPercent: 30,
      holdPercent: 0,
      percent: 30
    };
    for (const mode of ["wait", "tempo"] as const) {
      const markup = renderToStaticMarkup(
        <GameBoard
          mode={mode}
          playing
          game={score.snapshot(1)}
          noteResult={noteResult}
          onOverdrive={vi.fn()}
        />
      );
      expect(markup).toContain("30,0%");
      expect(markup).not.toContain("100,0%");
      expect(markup).toContain("Попадания — 30%, удержание — 70%");
    }
  });

  it("uses the unrounded shared result for stars and keeps timing accuracy separate", () => {
    const score = new GameScore(1);
    score.hit("a", 0, 0);
    const render = (percent: number) =>
      renderToStaticMarkup(
        <ResultDialog
          open
          course
          stats={{
            hits: 1,
            misses: 0,
            wrong: 0,
            meanOffset: 0,
            troubleSpots: [],
            game: score.snapshot(1),
            noteResult: {
              policy: NOTE_RESULT_POLICY,
              expectedNotes: 1,
              hitNotes: 1,
              hitPercent: 30,
              holdPercent: percent - 30,
              percent
            }
          }}
          canReview={false}
          onClose={vi.fn()}
          onAgain={vi.fn()}
          onReview={vi.fn()}
        />
      );
    const below = render(74.999);
    expect(below).toContain("75,0%");
    expect(below).toContain("Для зачёта нужно не меньше 75%");
    expect(below).not.toContain("Порог 75% достигнут");
    expect(below).toContain("Звёзды за попадания и удержание");
    expect(below).toContain('aria-label="Звёзды: 2 из 3"');
    expect(below).toContain("Ранг по времени");
    expect(below).toContain("Точность попадания: 100%");
    const window = new Window();
    window.document.body.innerHTML = below;
    const summary = window.document.querySelector(".result-summary");
    expect(summary?.textContent).toContain("75,0%");
    expect(summary?.textContent).toContain("Для зачёта нужно не меньше 75%");
    expect(window.document.querySelector(".result-details .result-score")).toBeNull();
    window.close();
    expect(render(75)).toContain("Порог 75% достигнут");
    expect(render(75)).toContain('aria-label="Звёзды: 3 из 3"');
    setInterfaceLanguage("en");
    expect(render(65)).toContain("Hits: 30% out of 30%");
    expect(render(65)).toContain("Holding: 35% out of 70%");
    expect(render(65)).toContain("You need at least 75% to pass");
    expect(render(65)).toContain("Hit timing accuracy: 100%");
  });
  it("awards holding result stars in wait mode without timing rank", () => {
    const markup = renderToStaticMarkup(
      <ResultDialog
        open
        stats={{
          hits: 1,
          misses: 0,
          wrong: 0,
          meanOffset: 0,
          troubleSpots: [],
          noteResult: {
            policy: NOTE_RESULT_POLICY,
            expectedNotes: 1,
            hitNotes: 1,
            hitPercent: 30,
            holdPercent: 35,
            percent: 65
          }
        }}
        canReview={false}
        onClose={vi.fn()}
        onAgain={vi.fn()}
        onReview={vi.fn()}
      />
    );
    expect(markup).toContain("65,0%");
    expect(markup).not.toContain("Звёзды за точность попадания");
    expect(markup).toContain("Звёзды за попадания и удержание");
    expect(markup).toContain('aria-label="Звёзды: 2 из 3"');
    expect(markup).not.toContain("Ранг по времени");
    expect(markup).not.toContain("Нет нот для оценки");
  });
  it("awards three stars for 85.2 percent even when attack accuracy is 45 percent", () => {
    const score = new GameScore(4);
    score.hit("a", 40, 0);
    score.hit("b", 70, 1);
    score.hit("c", 150, 2);
    score.hit("d", 150, 3);
    const game = score.snapshot(4);
    expect(game.accuracy).toBe(45);
    const markup = renderToStaticMarkup(
      <ResultDialog
        open
        stats={{
          hits: 4,
          misses: 0,
          wrong: 0,
          meanOffset: 0,
          troubleSpots: [],
          game,
          noteResult: {
            policy: NOTE_RESULT_POLICY,
            expectedNotes: 4,
            hitNotes: 4,
            hitPercent: 30,
            holdPercent: 55.2,
            percent: 85.2
          }
        }}
        canReview={false}
        onClose={vi.fn()}
        onAgain={vi.fn()}
        onReview={vi.fn()}
      />
    );
    expect(markup).toContain('aria-label="Звёзды: 3 из 3"');
    expect(markup).toContain("85,2%");
    expect(markup).toContain("Точность попадания: 45%");
  });
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
    expect(board()).toContain("Overdrive · 10 с");
    expect(board()).toContain('data-overdrive="true"');
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
    expect(render(score.snapshot(1))).toContain("75,0%");
    expect(render(score.snapshot(1))).toContain("идеальная игра без Overdrive");
    expect(render(score.snapshot(1))).toContain("Распределение ошибки времени");
    const empty = render(new GameScore(0).snapshot(0));
    expect(empty).toContain("Нет нот для оценки");
    expect(empty).not.toContain("Ранг");
  });

  it("shows the scorer's combo, accuracy and uncapped energy, without grade counts", () => {
    const score = new GameScore(62);
    for (let index = 0; index < 60; index++) score.hit(String(index), 0, index * 0.1);
    score.hit("good", 90, 6);
    score.miss("miss");
    const game = score.snapshot(7);
    const markup = renderToStaticMarkup(
      <GameBoard mode="tempo" playing onOverdrive={vi.fn()} game={game} />
    );
    expect(markup).toContain('class="game-combo__value">0</strong>');
    expect(markup).toContain(
      `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(game.accuracy ?? 0)}%`
    );
    expect(markup).not.toContain("data-grade");
    expect(markup).toContain('data-broken="true"');
    expect(markup).toContain('data-ready="true"');
    expect(markup).toContain(">122 / 50</strong>");
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

  it.each([
    ["full", true, false],
    ["keys", false, true],
    ["hidden", false, false]
  ] as const)("puts the score over a %s lane only when it shows its notes", (mode, lane, keys) => {
    const prefs = { ...prefsWith(lane), keys };
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
        editing={false}
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
    expect(window.document.querySelectorAll(".game-score-board")).toHaveLength(1);
    const inLane = window.document.querySelector(".lane > .game-score-board .game-overdrive");
    const inDock = window.document.querySelector(".game-score-dock .game-overdrive");
    expect([Boolean(inLane), Boolean(inDock)]).toEqual(
      mode === "full" ? [true, false] : [false, true]
    );
    window.close();
  });
});

describe("layout edit mode", () => {
  it.each([true, false])("shows the handles only while editing (editing: %s)", (editing) => {
    const markup = renderToStaticMarkup(
      <Workspace
        prefs={{ ...prefsWith(true), keys: true }}
        staffXml="<score-partwise/>"
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
        layoutMoved
        editing={editing}
        wordTicker={<span>text</span>}
      />
    );
    const window = new Window();
    window.document.body.innerHTML = markup;
    const count = (selector: string) => window.document.querySelectorAll(selector).length;
    // The staff's edge, the keys' two lines and their move grip.
    expect(count(".layout-handle")).toBe(editing ? 3 : 0);
    expect(count(".layout-move")).toBe(editing ? 1 : 0);
    expect(count(".layout-reset")).toBe(editing ? 1 : 0);
    expect(count(".ticker-zoom")).toBe(editing ? 2 : 0);
    // The running line keeps its place either way.
    expect(count(".word-ticker-slot")).toBe(1);
    window.close();
  });
});
