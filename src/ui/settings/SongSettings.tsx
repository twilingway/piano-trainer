import type { Dispatch, SetStateAction } from "react";

import { keyName } from "../../song/harmony";
import type { Key } from "../../song/harmony";

/**
 * The shift that takes `from` to `to`, -4..+7 semitones: up a fifth rather than
 * down a fourth, as C major to G major is usually written out.
 */
function shiftBetween(from: number, to: number): number {
  const up = (((to - from) % 12) + 12) % 12;
  return up > 7 ? up - 12 : up;
}

interface Props {
  /** The key the song is written in, if it reads as one. */
  readonly sourceKey: Key | undefined;
  /** Semitones the song is moved by. */
  readonly transpose: number;
  readonly onTranspose: Dispatch<SetStateAction<number>>;
  /** The player corrected some fingers. */
  readonly fingersChanged: boolean;
  readonly onResetFingers: () => void;
}

/** The song tab: its key and the finger corrections. */
export function SongSettings({
  sourceKey,
  transpose,
  onTranspose,
  fingersChanged,
  onResetFingers
}: Props) {
  return (
    <div className="settings-list">
      {sourceKey && (
        <label className="setting">
          <span>Тональность</span>
          <span className="setting-control">
            <button
              type="button"
              className="game-button"
              aria-label="На полтона ниже"
              onClick={() => {
                onTranspose((value) => Math.max(-11, value - 1));
              }}
            >
              −
            </button>
            <select
              className="game-select"
              aria-label="Тональность"
              value={(sourceKey.tonic + transpose + 12) % 12}
              onChange={(event) => {
                onTranspose(shiftBetween(sourceKey.tonic, Number(event.target.value)));
              }}
            >
              {Array.from({ length: 12 }, (_, tonic) => {
                const moved: Key = { tonic, mode: sourceKey.mode };
                const shift = shiftBetween(sourceKey.tonic, tonic);
                return (
                  <option key={tonic} value={tonic}>
                    {keyName(moved)}
                    {shift === 0 ? " (как в нотах)" : ""}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="game-button"
              aria-label="На полтона выше"
              onClick={() => {
                onTranspose((value) => Math.min(11, value + 1));
              }}
            >
              +
            </button>
          </span>
        </label>
      )}
      <div className="setting">
        <span>Пальцы, исправленные кликом по ноте</span>
        <button
          type="button"
          className="game-button"
          onClick={onResetFingers}
          disabled={!fingersChanged}
        >
          Сбросить пальцы
        </button>
      </div>
      <p className="setting-hint">
        Клик по падающей ноте меняет палец; клик по нотам на стане — играть с этого места.
      </p>
    </div>
  );
}
