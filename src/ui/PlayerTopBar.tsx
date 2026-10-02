import { useRef, type ReactNode } from "react";

import type { Scoreboard } from "../practice/scoreboard";
import { CompactPracticeChoices, HAND_CHOICES, HandsPicture } from "./CompactPracticeChoices";
import { FullscreenIcon, GearIcon, LibraryIcon, PauseIcon, PlayIcon, RestartIcon } from "./icons";
import { ViewHelp } from "./ViewHelp";

export type PracticeModeChoice = "wait" | "tempo";
export type HandsChoice = "right" | "left" | "both" | "listen";

interface Props {
  readonly title: string;
  readonly playing: boolean;
  readonly soundLoading: boolean;
  readonly mode: PracticeModeChoice;
  readonly hands: HandsChoice;
  readonly speed: number;
  readonly board: Scoreboard;
  /** The piano's name when one is connected. */
  readonly midi: string | undefined;
  readonly settingsOpen: boolean;
  readonly fullscreen: boolean;
  readonly onFullscreen: () => void;
  /** The view toggles, drawn on the bar's right. */
  readonly toggles: ReactNode;
  readonly onLibrary: () => void;
  readonly onRestart: () => void;
  readonly onTogglePlay: () => void;
  readonly onMode: (mode: PracticeModeChoice) => void;
  readonly onHands: (hands: HandsChoice) => void;
  readonly onSpeed: (speed: number) => void;
  readonly onSettings: () => void;
}

/**
 * The one bar over the game: the song, play, how to practise, the
 * scoreboard, what to show and the settings. Everything else lives in the
 * library and the settings panel.
 */
export function PlayerTopBar(props: Props) {
  const { board } = props;
  const controls = useRef<HTMLDetailsElement>(null);
  const handTitle = HAND_CHOICES.find((choice) => choice.value === props.hands)?.title ?? "Руки";
  return (
    <header className="topbar">
      <details className="compact-controls" ref={controls}>
        <summary className="icon-button" aria-label="Управление" title="Управление">
          <GearIcon />
        </summary>
        <div
          className="compact-controls__menu"
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(".compact-controls__menu > .game-button")
            ) {
              const menu = event.currentTarget.parentElement;
              if (menu instanceof HTMLDetailsElement) menu.open = false;
            }
          }}
        >
          <p className="compact-controls__stats">
            {props.title}
            <br />
            {board.measure
              ? `такт ${String(board.measure.current)}/${String(board.measure.total)}`
              : board.clock}
            {board.bpm === undefined ? "" : ` · ♩ ${String(board.bpm)}`} ·{" "}
            {Math.round(props.speed * 100)}%
            <br />
            {props.midi ? `MIDI: ${props.midi}` : "MIDI не подключено"}
          </p>
          <CompactPracticeChoices
            hands={props.hands}
            mode={props.mode}
            onHands={props.onHands}
            onMode={props.onMode}
          />
          <div className="compact-controls__view-head">
            <span>Вид</span>
            <ViewHelp />
          </div>
          <div className="setting-control setting-control--views compact-controls__views">
            {props.toggles}
          </div>
          <button type="button" className="game-button" onClick={props.onLibrary}>
            <LibraryIcon /> Библиотека
          </button>
          <button
            type="button"
            className="game-button"
            onClick={props.onSettings}
            aria-pressed={props.settingsOpen}
          >
            <GearIcon /> Настройки
          </button>
        </div>
      </details>
      <button
        type="button"
        className="icon-button compact-hands"
        aria-label={`Выбор рук: ${handTitle}`}
        title={`${handTitle} — выбрать руки`}
        onClick={() => {
          const menu = controls.current;
          if (!menu) return;
          menu.open = true;
          const choices = menu.querySelector(".compact-practice__hands");
          choices?.scrollIntoView({ block: "nearest" });
          choices
            ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
            ?.focus({ preventScroll: true });
        }}
      >
        <HandsPicture hands={props.hands} />
      </button>
      <button
        type="button"
        className="game-button topbar-library"
        aria-label={`Библиотека: ${props.title}`}
        title="Библиотека"
        onClick={props.onLibrary}
      >
        <LibraryIcon />
        <span className="topbar-title">{props.title}</span>
      </button>
      <button
        type="button"
        className="game-button topbar-restart"
        aria-label="Сначала"
        title="Сначала"
        onClick={props.onRestart}
      >
        <RestartIcon />
        <span className="topbar-restart__label">Сначала</span>
      </button>
      <button
        type="button"
        className="play-button"
        data-playing={props.playing}
        aria-label={props.soundLoading ? "Звук…" : props.playing ? "Пауза" : "Играть"}
        title={props.playing ? "Пауза" : "Играть"}
        disabled={props.soundLoading}
        onClick={props.onTogglePlay}
      >
        <span className="play-button__ring">{props.playing ? <PauseIcon /> : <PlayIcon />}</span>
        <span className="play-button__label">
          {props.soundLoading ? "Звук…" : props.playing ? "Пауза" : "Играть"}
        </span>
      </button>
      <div className="segmented" role="radiogroup" aria-label="Режим">
        {(
          [
            ["wait", "Ждать ноту"],
            ["tempo", "В темпе"]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={props.mode === value}
            onClick={() => {
              props.onMode(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <select
        className="game-select"
        aria-label="Руки"
        value={props.hands}
        onChange={(event) => {
          props.onHands(event.target.value as HandsChoice);
        }}
      >
        <option value="right">Правая рука</option>
        <option value="left">Левая рука</option>
        <option value="both">Обе руки</option>
        <option value="listen">Только слушать</option>
      </select>
      <label className="topbar-speed" title="Скорость">
        <span className="digits">{Math.round(props.speed * 100)}%</span>
        <input
          type="range"
          aria-label="Скорость"
          min={0.25}
          max={1}
          step={0.05}
          value={props.speed}
          onChange={(event) => {
            props.onSpeed(Number(event.target.value));
          }}
        />
      </label>
      <div className="scoreboard" aria-live="off">
        {board.measure ? (
          <span>
            такт <b className="digits">{board.measure.current}</b>
            <span className="digits">/{board.measure.total}</span>
          </span>
        ) : (
          <span className="digits">{board.clock}</span>
        )}
        {board.bpm !== undefined && (
          <span>
            ♩ <b className="digits">{board.bpm}</b>
          </span>
        )}
        <span
          className="midi-dot"
          data-on={props.midi !== undefined}
          title={props.midi ? `Пианино: ${props.midi}` : "Пианино не подключено"}
        >
          MIDI
        </span>
      </div>
      <div className="topbar-toggles">{props.toggles}</div>
      <button
        type="button"
        className="icon-button topbar-fullscreen"
        data-fullscreen-toggle
        aria-label={props.fullscreen ? "Свернуть" : "На весь экран"}
        title={props.fullscreen ? "Свернуть" : "На весь экран"}
        aria-pressed={props.fullscreen}
        onClick={props.onFullscreen}
      >
        <FullscreenIcon active={props.fullscreen} />
      </button>
      <button
        type="button"
        className="icon-button topbar-settings"
        aria-label="Настройки"
        title="Настройки"
        aria-pressed={props.settingsOpen}
        onClick={props.onSettings}
      >
        <GearIcon />
      </button>
    </header>
  );
}
