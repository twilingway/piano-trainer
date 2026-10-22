import { useState } from "react";
import { useI18n } from "../app/useI18n";
interface Props {
  /** How far the song has got, 0 to 1. */
  readonly progress: number;
  /** Seconds on the session's song clock, before the player's speed multiplier. */
  readonly time: number;
  readonly duration: number;
  /** Where each measure starts, 0 to 1. */
  readonly ticks: readonly number[];
  /** Song-clock seconds at the same beat share used by seeking. */
  readonly timeAtShare: (share: number) => number;
  /** Goes to a share of the song, 0 to 1. */
  readonly onSeek: (share: number) => void;
}

/** A thin strip under the bar: how far the song has got, measure ticks, and a click to go there. */
export function SongProgress({ progress, time, duration, ticks, timeAtShare, onSeek }: Props) {
  const { t } = useI18n();
  const [hoverShare, setHoverShare] = useState<number | null>(null);
  const total = Math.max(0, duration);
  const elapsed = Math.min(total, Math.max(0, time));
  const share = Math.min(1, Math.max(0, progress));
  const elapsedText = songTime(elapsed);
  const totalText = songTime(total);
  return (
    <div
      className="song-progress"
      role="slider"
      aria-label={t("Ход песни")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={t("{elapsed} из {total}", { elapsed: elapsedText, total: totalText })}
      tabIndex={0}
      onPointerMove={(event) => {
        setHoverShare(
          event.pointerType === "touch" ? null : pointerShare(event.currentTarget, event.clientX)
        );
      }}
      onPointerLeave={() => {
        setHoverShare(null);
      }}
      onBlur={() => {
        setHoverShare(null);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") setHoverShare(null);
        onSeek(pointerShare(event.currentTarget, event.clientX));
      }}
      onKeyDown={(event) => {
        // Arrow keys only with the strip focused: they are not music keys there.
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onSeek(Math.min(1, Math.max(0, share + (event.key === "ArrowRight" ? 0.02 : -0.02))));
        }
      }}
    >
      <div className="song-progress__fill" style={{ width: `${String(share * 100)}%` }} />
      {ticks.map((tick, index) => (
        <span
          key={index}
          className="song-progress__tick"
          style={{ left: `${String(tick * 100)}%` }}
        />
      ))}
      <span className="song-progress__time" aria-hidden="true">
        {elapsedText} / {totalText}
      </span>
      {hoverShare !== null ? (
        <span
          className="song-progress__preview"
          aria-hidden="true"
          style={{
            left: `${String(hoverShare * 100)}%`,
            transform: `translateX(-${String(hoverShare * 100)}%)`
          }}
        >
          {songTime(Math.min(total, Math.max(0, timeAtShare(hoverShare))))}
        </span>
      ) : null}
    </div>
  );
}

function pointerShare(element: HTMLElement, clientX: number): number {
  const box = element.getBoundingClientRect();
  return box.width > 0 ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0;
}

function songTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
