import { useI18n } from "../../app/useI18n";
import type { Dispatch, SetStateAction } from "react";

import { keyName, shiftBetween, transposeKey } from "../../song/keySignature";
import type { Key } from "../../song/keySignature";

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
export function SongSettings({ sourceKey, transpose, onTranspose, onResetFingers }: Props) {
  const { t } = useI18n();
  return (
    <div className="settings-list">
      {sourceKey && (
        <label className="setting">
          <span>{t("Тональность")}</span>
          <span className="setting-control">
            <button
              type="button"
              className="game-button"
              aria-label={t("На полтона ниже")}
              onClick={() => {
                onTranspose((value) => Math.max(-11, value - 1));
              }}
            >
              −
            </button>
            <select
              className="game-select"
              aria-label={t("Тональность")}
              value={(sourceKey.tonic + transpose + 12) % 12}
              onChange={(event) => {
                onTranspose(shiftBetween(sourceKey.tonic, Number(event.target.value)));
              }}
            >
              {Array.from({ length: 12 }, (_, tonic) => {
                const shift = shiftBetween(sourceKey.tonic, tonic);
                const moved = transposeKey(sourceKey, shift);
                return (
                  <option key={tonic} value={tonic}>
                    {t(keyName(moved))}
                    {shift === 0
                      ? sourceKey.fifths === undefined
                        ? t(" (исходная)")
                        : t(" (как в нотах)")
                      : ""}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="game-button"
              aria-label={t("На полтона выше")}
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
        <span>{t("Пальцы, исправленные кликом по ноте")}</span>
        <button
          type="button"
          className="game-button"
          onClick={onResetFingers}
          disabled
          title={t("Изменение пальцев временно отключено")}
        >
          {t("Сбросить пальцы")}
        </button>
      </div>
      <p className="setting-hint">
        {t("Изменение пальцев временно отключено. Клик по нотам на стане — играть с этого места.")}
      </p>
    </div>
  );
}
