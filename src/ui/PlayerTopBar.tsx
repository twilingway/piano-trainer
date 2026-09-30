import type { ReactNode } from "react";

import type { Scoreboard } from "../practice/scoreboard";
import { GearIcon, LibraryIcon, PauseIcon, PlayIcon, RestartIcon } from "./icons";

export type PracticeModeChoice = "wait" | "tempo";
export type HandsChoice = "right" | "left" | "both" | "listen";

interface Props {
  readonly title: string;
  /** The bar is out of the way while the song plays. */
  readonly hidden: boolean;
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
    <header className="topbar" data-hidden={props.hidden}>
      <button type="button" className="game-button topbar-library" onClick={props.onLibrary}>
        <LibraryIcon />
        <span className="topbar-title">{props.title}</span>
      </button>
      <button
        type="button"
        className="icon-button"
        title="Сначала"
        aria-label="Сначала"
        onClick={props.onRestart}
      >
        <RestartIcon />
      </button>
      <button
        type="button"
        className="play-button"
        aria-label={props.playing ? "Пауза" : "Играть"}
        title={props.soundLoading ? "Загружаю звук…" : props.playing ? "Пауза" : "Играть"}
        disabled={props.soundLoading}
        onClick={props.onTogglePlay}
      >
        {props.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <select
        className="game-select"
        aria-label="Режим"
        value={props.mode}
        onChange={(event) => {
          props.onMode(event.target.value as PracticeModeChoice);
        }}
      >
        <option value="wait">Ждать ноту</option>
        <option value="tempo">В темпе</option>
      </select>
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
