import type { ReactNode } from "react";

import type { Scoreboard } from "../practice/scoreboard";
import { GearIcon, LibraryIcon, PauseIcon, PlayIcon, RestartIcon } from "./icons";

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
  return (
    <header className="topbar">
      <button type="button" className="game-button topbar-library" onClick={props.onLibrary}>
        <LibraryIcon />
        <span className="topbar-title">{props.title}</span>
      </button>
      <button type="button" className="game-button" onClick={props.onRestart}>
        <RestartIcon />
        Сначала
      </button>
      <button
        type="button"
        className="play-button"
        data-playing={props.playing}
        disabled={props.soundLoading}
        onClick={props.onTogglePlay}
      >
        <span className="play-button__ring">{props.playing ? <PauseIcon /> : <PlayIcon />}</span>
        {props.soundLoading ? "Звук…" : props.playing ? "Пауза" : "Играть"}
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
        className="icon-button"
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
