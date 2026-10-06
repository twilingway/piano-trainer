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
  /** Whole octaves the song is moved by on top of the key, −2…+2. */
  readonly octave: number;
  readonly onOctave: (octave: number) => void;
  /** Notes of the player's hands off their keyboard, and the octave that fits them best. */
  readonly outside: number;
  readonly bestOctave: number;
  /** The player corrected some fingers. */
  readonly fingersChanged: boolean;
  readonly onResetFingers: () => void;
  /** A MIDI song plays as the file is or in a simpler version; none for a score. */
  readonly arrangement?:
    { readonly simplified: boolean; readonly onSimplified: (on: boolean) => void } | undefined;
}

/** The song tab: its key, its octave and the finger corrections. */
export function SongSettings({
  sourceKey,
  transpose,
  onTranspose,
  octave,
  onOctave,
  outside,
  bestOctave,
  onResetFingers,
  arrangement
}: Props) {
  const { t } = useI18n();
  const move = bestOctave - octave;
  return (
    <div className="settings-list">
      {arrangement && (
        <label className="setting">
          <span title={t("Упрощённая: мелодия справа, бас и до двух нот аккорда слева.")}>
            {t("Аранжировка")}
          </span>
          <select
            className="game-select"
            aria-label={t("Аранжировка")}
            value={arrangement.simplified ? "simplified" : "original"}
            onChange={(event) => {
              arrangement.onSimplified(event.target.value === "simplified");
            }}
          >
            <option value="original">{t("Как в файле")}</option>
            <option value="simplified">{t("Упрощённая")}</option>
          </select>
        </label>
      )}
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
        <span>{t("Октава")}</span>
        <span className="setting-control">
          <button
            type="button"
            className="game-button"
            aria-label={t("Октавой ниже")}
            disabled={octave <= -2}
            onClick={() => {
              onOctave(octave - 1);
            }}
          >
            −
          </button>
          <span className="digits">{octave > 0 ? `+${String(octave)}` : String(octave)}</span>
          <button
            type="button"
            className="game-button"
            aria-label={t("Октавой выше")}
            disabled={octave >= 2}
            onClick={() => {
              onOctave(octave + 1);
            }}
          >
            +
          </button>
        </span>
      </div>
      {outside > 0 && (
        <div className="setting">
          <span className="setting-hint">
            {t("Нот вне вашей клавиатуры: {count}.", { count: outside })}
          </span>
          {move !== 0 && (
            <button
              type="button"
              className="game-button"
              onClick={() => {
                onOctave(bestOctave);
              }}
            >
              {move === -1
                ? t("Октава вниз")
                : move === 1
                  ? t("Октава вверх")
                  : move < 0
                    ? t("Октав вниз: {count}", { count: -move })
                    : t("Октав вверх: {count}", { count: move })}
            </button>
          )}
        </div>
      )}
      <div className="setting">
        <span>{t("Пальцы, исправленные кликом по ноте")}</span>
        <button
          type="button"
          className="game-button"
          onClick={onResetFingers}
          disabled
          title={t("Пальцы пока нельзя менять")}
        >
          {t("Сбросить пальцы")}
        </button>
      </div>
      <p className="setting-hint">
        {t("Пальцы пока нельзя менять. Клик по ноте на стане — играть с этого места.")}
      </p>
    </div>
  );
}
