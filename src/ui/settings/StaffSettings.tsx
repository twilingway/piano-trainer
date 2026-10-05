import { useI18n } from "../../app/useI18n";
import type { StaffPrefs } from "../../app/useStaffPrefs";

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

interface Props {
  readonly prefs: StaffPrefs;
  /** The song has a score; a MIDI song has nothing to set here. */
  readonly hasScore: boolean;
  readonly onChange: (change: Partial<StaffPrefs>) => void;
}

/** The staff tab: zoom, lines, following the play, names, fingers and chords. */
export function StaffSettings({ prefs, hasScore, onChange }: Props) {
  const { t } = useI18n();
  if (!hasScore) {
    return (
      <p className="setting-hint">{t("У этой песни нет нотной записи: она открыта из MIDI.")}</p>
    );
  }
  return (
    <div className="settings-list">
      <div className="setting">
        <span>{t("Масштаб")}</span>
        <span className="setting-control">
          <button
            type="button"
            className="game-button"
            aria-label={t("Мельче")}
            disabled={prefs.zoom <= ZOOM_MIN + 1e-9}
            onClick={() => {
              onChange({
                zoom: Math.max(ZOOM_MIN, Math.round((prefs.zoom - ZOOM_STEP) * 10) / 10)
              });
            }}
          >
            −
          </button>
          <span className="digits">{Math.round(prefs.zoom * 100)}%</span>
          <button
            type="button"
            className="game-button"
            aria-label={t("Крупнее")}
            disabled={prefs.zoom >= ZOOM_MAX - 1e-9}
            onClick={() => {
              onChange({
                zoom: Math.min(ZOOM_MAX, Math.round((prefs.zoom + ZOOM_STEP) * 10) / 10)
              });
            }}
          >
            +
          </button>
        </span>
      </div>
      <label className="setting">
        <span>{t("По строкам")}</span>
        <input
          type="checkbox"
          checked={!prefs.singleLine}
          onChange={(event) => {
            onChange({ singleLine: !event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        <span>{t("Цвет нот")}</span>
        <input
          type="color"
          aria-label={t("Цвет нот")}
          value={prefs.noteColor}
          onChange={(event) => {
            onChange({ noteColor: event.target.value });
          }}
        />
      </label>
      <label className="setting">
        <span>{t("Цвет партитуры")}</span>
        <input
          type="color"
          aria-label={t("Цвет партитуры")}
          value={prefs.scoreColor}
          onChange={(event) => {
            onChange({ scoreColor: event.target.value });
          }}
        />
      </label>
      <label className="setting">
        <span>{t("Следовать за игрой")}</span>
        <input
          type="checkbox"
          checked={prefs.follow}
          onChange={(event) => {
            onChange({ follow: event.target.checked });
          }}
        />
      </label>
      {!prefs.singleLine && (
        <label className="setting">
          <span>{t("Тактов в строке")}</span>
          <select
            className="game-select"
            value={prefs.measuresPerLine}
            onChange={(event) => {
              onChange({
                measuresPerLine: Number(event.target.value) as StaffPrefs["measuresPerLine"]
              });
            }}
          >
            <option value={0}>{t("Авто")}</option>
            <option value={2}>{t("По 2 такта")}</option>
            <option value={4}>{t("По 4 такта")}</option>
            <option value={8}>{t("По 8 тактов")}</option>
          </select>
        </label>
      )}
      <label className="setting">
        <span>{t("Названия на нотах")}</span>
        <select
          className="game-select"
          value={prefs.noteNames}
          onChange={(event) => {
            onChange({ noteNames: event.target.value as StaffPrefs["noteNames"] });
          }}
        >
          <option value="off">{t("Нет")}</option>
          <option value="ru">до ре ми</option>
          <option value="en">C D E</option>
        </select>
      </label>
      <label className="setting">
        <span>{t("Номера пальцев")}</span>
        <input
          type="checkbox"
          checked={prefs.fingers}
          onChange={(event) => {
            onChange({ fingers: event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        <span>{t("Аккорды")}</span>
        <input
          type="checkbox"
          checked={prefs.chords}
          onChange={(event) => {
            onChange({ chords: event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        <span>{t("Цвет номеров пальцев")}</span>
        <select
          className="game-select"
          value={prefs.fingerColors}
          aria-label={t("Цвет номеров пальцев")}
          disabled={!prefs.fingers}
          onChange={(event) => {
            onChange({ fingerColors: event.target.value as StaffPrefs["fingerColors"] });
          }}
        >
          <option value="mono">{t("Одноцветные")}</option>
          <option value="fingers">{t("По цветам пальцев")}</option>
        </select>
      </label>
    </div>
  );
}
