interface Props {
  /** How far the song has got, 0 to 1. */
  readonly progress: number;
  /** Where each measure starts, 0 to 1. */
  readonly ticks: readonly number[];
  /** Goes to a share of the song, 0 to 1. */
  readonly onSeek: (share: number) => void;
}

/** A thin strip under the bar: how far the song has got, measure ticks, and a click to go there. */
export function SongProgress({ progress, ticks, onSeek }: Props) {
  return (
    <div
      className="song-progress"
      role="slider"
      aria-label="Ход песни"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
      }}
      onKeyDown={(event) => {
        // Arrow keys only with the strip focused: they are not music keys there.
        if (event.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.02));
        if (event.key === "ArrowRight") onSeek(Math.min(1, progress + 0.02));
      }}
    >
      <div className="song-progress__fill" style={{ width: `${String(progress * 100)}%` }} />
      {ticks.map((tick, index) => (
        <span
          key={index}
          className="song-progress__tick"
          style={{ left: `${String(tick * 100)}%` }}
        />
      ))}
    </div>
  );
}
