import { useI18n } from "../app/useI18n";
import { useRef, useSyncExternalStore, type ReactNode } from "react";

import type { Scoreboard } from "../practice/scoreboard";
import { ROLE_TITLE } from "../song/midiParts";
import {
  choiceValue,
  chooseValue,
  CompactPracticeChoices,
  HAND_CHOICES,
  HandsPicture,
  PartOptions
} from "./CompactPracticeChoices";
import type { PartsChoice } from "./CompactPracticeChoices";
import { FullscreenIcon, GearIcon, LibraryIcon, PauseIcon, PlayIcon, RestartIcon } from "./icons";
import { BarPopover } from "./BarPopover";
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
  readonly board?: Scoreboard;
  readonly scoreboard?: ReactNode;
  readonly compactPosition?: ReactNode;
  /** The piano's name when one is connected. */
  readonly midi: string | undefined;
  readonly settingsOpen: boolean;
  readonly fullscreen: boolean;
  readonly onFullscreen: () => void;
  /** The view toggles: the phone's menu and the bar's «Вид ▾» hold them. */
  readonly toggles: ReactNode;
  /** The wide bar's choice of game. */
  readonly game?: ReactNode;
  /** The mode's own settings by the hands, such as the word mode's «Текст ▾». */
  readonly practice?: ReactNode;
  /** Course phrase navigation shares the bar and the compact menu, with one mounted instance. */
  readonly course?: ReactNode;
  /** The applied timing, a chip by the scoreboard. */
  readonly timing?: ReactNode;
  readonly language?: ReactNode;
  /** The mode's own controls, which the phone's menu holds instead of a strip of their own. */
  readonly menuExtra?: ReactNode;
  /** The screen's parts show their handles and drag. */
  readonly editing: boolean;
  readonly onToggleEditing: () => void;
  readonly onLibrary: () => void;
  readonly onRestart: () => void;
  readonly onTogglePlay: () => void;
  readonly onMode: (mode: PracticeModeChoice) => void;
  readonly onHands: (hands: HandsChoice) => void;
  /** The song's parts to play alone and the accompaniment switch. */
  readonly parts?: PartsChoice | undefined;
  /** A MIDI song's full or simplified version, by the hands; none for a score. */
  readonly difficulty?:
    { readonly simplified: boolean; readonly onSimplified: (on: boolean) => void } | undefined;
  readonly onSpeed: (speed: number) => void;
  readonly onSettings: () => void;
}

/**
 * The one bar over the game: the song, the game, play, how to practise, the
 * timing, the scoreboard, what to show and the settings. Everything else lives
 * in the library and the settings panel.
 */
export function PlayerTopBar(props: Props) {
  const { t, formatNumber } = useI18n();
  const board = props.board ?? { clock: "0:00" };
  const controls = useRef<HTMLDetailsElement>(null);
  const compact = useSyncExternalStore(subscribeCompact, compactSnapshot, () => false);
  const handTitle = t(
    props.parts?.role
      ? ROLE_TITLE[props.parts.role]
      : (HAND_CHOICES.find((choice) => choice.value === props.hands)?.title ?? "Руки")
  );
  return (
    <header className={`topbar${props.course ? " topbar--course" : ""}`}>
      <details className="compact-controls" ref={controls}>
        <summary className="icon-button" aria-label={t("Управление")} title={t("Управление")}>
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
            {props.compactPosition ?? <CompactSongPosition board={board} speed={props.speed} />}
            <br />
            {props.midi ? `MIDI: ${props.midi}` : t("MIDI не подключено")}
          </p>
          {compact && props.course}
          <CompactPracticeChoices
            hands={props.hands}
            mode={props.mode}
            onHands={props.onHands}
            onMode={props.onMode}
            parts={props.parts}
          />
          {props.difficulty && <CompactDifficulty {...props.difficulty} />}
          {props.menuExtra}
          <div className="compact-controls__view-head">
            <span>{t("Вид")}</span>
            <ViewHelp />
          </div>
          <div className="setting-control setting-control--views compact-controls__views">
            {props.toggles}
          </div>
          <button
            type="button"
            className="game-button"
            aria-pressed={props.editing}
            onClick={props.onToggleEditing}
          >
            {t("✎ Редактировать интерфейс")}
          </button>
          <button type="button" className="game-button" onClick={props.onLibrary}>
            <LibraryIcon /> {t("Библиотека")}
          </button>
          <button
            type="button"
            className="game-button"
            onClick={props.onSettings}
            aria-pressed={props.settingsOpen}
          >
            <GearIcon /> {t("Настройки")}
          </button>
        </div>
      </details>
      <button
        type="button"
        className="icon-button compact-hands"
        aria-label={t("Выбор рук: {hands}", { hands: handTitle })}
        title={t("{hands} — выбрать руки", { hands: handTitle })}
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
        aria-label={t("Библиотека: {title}", { title: props.title })}
        title={t("Библиотека")}
        onClick={props.onLibrary}
      >
        <LibraryIcon />
        <span className="topbar-library__label">{t("Библиотека")}</span>
      </button>
      <span className="topbar-title" title={props.title}>
        {props.title}
      </span>
      {props.game}
      <button
        type="button"
        className="game-button topbar-restart"
        aria-label={t("Сначала")}
        title={t("Сначала")}
        onClick={props.onRestart}
      >
        <RestartIcon />
        <span className="topbar-restart__label">{t("Сначала")}</span>
      </button>
      <button
        type="button"
        className="play-button"
        data-playing={props.playing}
        aria-label={props.soundLoading ? t("Звук…") : props.playing ? t("Пауза") : t("Играть")}
        title={props.playing ? t("Пауза") : t("Играть")}
        disabled={props.soundLoading}
        onClick={props.onTogglePlay}
      >
        <span className="play-button__ring">{props.playing ? <PauseIcon /> : <PlayIcon />}</span>
        <span className="play-button__label">
          {props.soundLoading ? t("Звук…") : props.playing ? t("Пауза") : t("Играть")}
        </span>
      </button>
      <div className="segmented" role="radiogroup" aria-label={t("Режим")}>
        {(
          [
            ["wait", t("Ждать ноту")],
            ["tempo", t("В темпе")]
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
        className="game-select topbar-hands"
        aria-label={t("Руки")}
        value={choiceValue(props.hands, props.parts)}
        onChange={(event) => {
          chooseValue(event.target.value, props.onHands, props.parts);
        }}
      >
        <option value="right">{t("Правая рука")}</option>
        <option value="left">{t("Левая рука")}</option>
        <option value="both">{t("Обе руки")}</option>
        <option value="listen">{t("Только слушать")}</option>
        <PartOptions parts={props.parts} />
      </select>
      {!compact && props.course}
      {props.difficulty && (
        <select
          className="game-select topbar-difficulty"
          aria-label={t("Сложность")}
          title={`${t("Сложность")}: ${difficultyHint(props.difficulty.simplified, t)}`}
          value={props.difficulty.simplified ? "simplified" : "full"}
          onChange={(event) => {
            props.difficulty?.onSimplified(event.target.value === "simplified");
          }}
        >
          <option value="full" title={difficultyHint(false, t)}>
            {t("Полная")}
          </option>
          <option value="simplified" title={difficultyHint(true, t)}>
            {t("Упрощённая")}
          </option>
        </select>
      )}
      {props.practice}
      <label className="topbar-speed" title={t("Скорость")}>
        <span className="digits">{formatNumber(Math.round(props.speed * 100))}%</span>
        <input
          type="range"
          aria-label={t("Скорость")}
          min={0.01}
          max={1}
          step={0.01}
          value={props.speed}
          onChange={(event) => {
            props.onSpeed(Number(event.target.value));
          }}
        />
      </label>
      {props.timing}
      {props.scoreboard ?? <SongScoreboard board={board} midi={props.midi} />}
      <BarPopover
        className="topbar-view"
        label={t("Вид")}
        summary={
          <>
            {t("Вид")} <span aria-hidden="true">▾</span>
          </>
        }
      >
        <div className="compact-controls__view-head">
          <span>{t("Что показывать")}</span>
          <ViewHelp />
        </div>
        <div className="setting-control setting-control--views">{props.toggles}</div>
        <button
          type="button"
          className="game-button"
          aria-pressed={props.editing}
          onClick={props.onToggleEditing}
        >
          {t("✎ Редактировать интерфейс")}
        </button>
      </BarPopover>
      <button
        type="button"
        className="icon-button topbar-fullscreen"
        data-fullscreen-toggle
        aria-label={props.fullscreen ? t("Свернуть") : t("На весь экран")}
        title={props.fullscreen ? t("Свернуть") : t("На весь экран")}
        aria-pressed={props.fullscreen}
        onClick={props.onFullscreen}
      >
        <FullscreenIcon active={props.fullscreen} />
      </button>
      {props.language}
      <button
        type="button"
        className="icon-button topbar-settings"
        aria-label={t("Настройки")}
        title={t("Настройки")}
        aria-pressed={props.settingsOpen}
        onClick={props.onSettings}
      >
        <GearIcon />
      </button>
    </header>
  );
}

const COMPACT_MEDIA = "(height <= 500px), (width <= 640px)";
function compactSnapshot(): boolean {
  return window.matchMedia(COMPACT_MEDIA).matches;
}
function subscribeCompact(notify: () => void): () => void {
  const media = window.matchMedia(COMPACT_MEDIA);
  media.addEventListener("change", notify);
  return () => {
    media.removeEventListener("change", notify);
  };
}

/** What a difficulty plays, for its tooltip and the phone's caption. */
function difficultyHint(simplified: boolean, t: (message: string) => string): string {
  return simplified
    ? t("Мелодия в правой руке, слева бас и до двух нот аккорда.")
    : t("Все ноты песни.");
}

/** The phone's menu: no tooltips on touch, so the difficulty carries a caption. */
function CompactDifficulty({
  simplified,
  onSimplified
}: {
  readonly simplified: boolean;
  readonly onSimplified: (on: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="compact-practice">
      <span className="compact-practice__heading">{t("Сложность")}</span>
      <div className="segmented" role="radiogroup" aria-label={t("Сложность")}>
        {(
          [
            [false, t("Полная")],
            [true, t("Упрощённая")]
          ] as const
        ).map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={simplified === value}
            onClick={() => {
              onSimplified(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="compact-practice__hint">{difficultyHint(simplified, t)}</p>
    </div>
  );
}

export function CompactSongPosition({
  board,
  speed
}: {
  readonly board: Scoreboard;
  readonly speed: number;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <>
      {board.measure
        ? t("такт {current}/{total}", {
            current: formatNumber(board.measure.current),
            total: formatNumber(board.measure.total)
          })
        : board.clock}
      {board.bpm === undefined ? "" : ` · ♩ ${formatNumber(board.bpm)}`} ·{" "}
      {formatNumber(Math.round(speed * 100))}%
    </>
  );
}

export function SongScoreboard({
  board,
  midi
}: {
  readonly board: Scoreboard;
  readonly midi: string | undefined;
}) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="scoreboard" aria-live="off">
      {board.measure ? (
        <span>
          {t("такт")} <b className="digits">{formatNumber(board.measure.current)}</b>
          <span className="digits">/{formatNumber(board.measure.total)}</span>
        </span>
      ) : (
        <span className="digits">{board.clock}</span>
      )}
      {board.bpm !== undefined && (
        <span>
          ♩ <b className="digits">{formatNumber(board.bpm)}</b>
        </span>
      )}
      <span
        className="midi-dot"
        data-on={midi !== undefined}
        title={midi ? t("Пианино: {piano}", { piano: midi }) : t("Пианино не подключено")}
      >
        MIDI
      </span>
    </div>
  );
}
