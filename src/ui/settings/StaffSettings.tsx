import type { StaffPrefs } from "../../app/useStaffPrefs";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

interface Props {
  readonly prefs: StaffPrefs;
  /** The song has a score; a MIDI song has nothing to set here. */
  readonly hasScore: boolean;
  readonly onChange: (change: Partial<StaffPrefs>) => void;
}

/** The staff tab: zoom, lines, following the play, names, fingers and chords. */
export function StaffSettings({ prefs, hasScore, onChange }: Props) {
  if (!hasScore) {
    return <p className="setting-hint">У этой песни нет нотной записи: она открыта из MIDI.</p>;
  }
  return (
    <div className="settings-list">
      <div className="setting">
        <span>Масштаб</span>
        <span className="setting-control">
          <button
            type="button"
            className="game-button"
            aria-label="Мельче"
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
            aria-label="Крупнее"
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
        <span>По строкам</span>
        <input
          type="checkbox"
          checked={!prefs.singleLine}
          onChange={(event) => {
            onChange({ singleLine: !event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        <span>Цвет нот</span>
        <input
          type="color"
          aria-label="Цвет нот"
          value={prefs.noteColor}
          onChange={(event) => {
            onChange({ noteColor: event.target.value });
          }}
        />
      </label>
      <label className="setting">
        <span>Цвет партитуры</span>
        <input
          type="color"
          aria-label="Цвет партитуры"
          value={prefs.scoreColor}
          onChange={(event) => {
            onChange({ scoreColor: event.target.value });
          }}
        />
      </label>
      <div className="setting">
        <span>Линии, ключи и обозначения</span>
        <button
          type="button"
          className="game-button"
          onClick={() => {
            onChange({ noteColor: "#62d9ff", scoreColor: "#62d9ff" });
          }}
        >
          Голубые цвета
        </button>
      </div>
      <label className="setting">
        <span>Следовать за игрой</span>
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
          <span>Тактов в строке</span>
          <select
            className="game-select"
            value={prefs.measuresPerLine}
            onChange={(event) => {
              onChange({
                measuresPerLine: Number(event.target.value) as StaffPrefs["measuresPerLine"]
              });
            }}
          >
            <option value={0}>Авто</option>
            <option value={2}>По 2 такта</option>
            <option value={4}>По 4 такта</option>
            <option value={8}>По 8 тактов</option>
          </select>
        </label>
      )}
      <label className="setting">
        <span>Названия на нотах</span>
        <select
          className="game-select"
          value={prefs.noteNames}
          onChange={(event) => {
            onChange({ noteNames: event.target.value as StaffPrefs["noteNames"] });
          }}
        >
          <option value="off">Нет</option>
          <option value="ru">до ре ми</option>
          <option value="en">C D E</option>
        </select>
      </label>
      <label className="setting">
        <span>Номера пальцев</span>
        <input
          type="checkbox"
          checked={prefs.fingers}
          onChange={(event) => {
            onChange({ fingers: event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        <span>Аккорды</span>
        <input
          type="checkbox"
          checked={prefs.chords}
          onChange={(event) => {
            onChange({ chords: event.target.checked });
          }}
        />
      </label>
    </div>
  );
}
