import { SettingsGroup } from "./SettingsGroup";
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

/** Staff and piano tab scale, line layout, following the play and notation colors. */
export function StaffSettings({ prefs, hasScore, onChange }: Props) {
  const { t } = useI18n();
  if (!hasScore) {
    return (
      <p className="setting-hint">{t("У этой песни нет нотной записи: она открыта из MIDI.")}</p>
    );
  }
  return (
    <div className="settings-list">
      <p className="setting-hint">
        {t("Эти настройки применяются к нотному стану и пианинным табам.")}
      </p>
      <SettingsGroup title={t("Размер и прокрутка")}>
        <div className="settings-list">
          {[
            {
              key: "zoom",
              label: t("Масштаб нотного стана"),
              smaller: t("Уменьшить нотный стан"),
              larger: t("Увеличить нотный стан")
            },
            {
              key: "tabsZoom",
              label: t("Масштаб пианинных табов"),
              smaller: t("Уменьшить пианинные табы"),
              larger: t("Увеличить пианинные табы")
            }
          ].map(({ key, label, smaller, larger }) => {
            const value = key === "zoom" ? prefs.zoom : prefs.tabsZoom;
            const update = (next: number) => {
              onChange(key === "zoom" ? { zoom: next } : { tabsZoom: next });
            };
            return (
              <div className="setting" key={key}>
                <span>{label}</span>
                <span className="setting-control">
                  <button
                    type="button"
                    className="game-button"
                    aria-label={smaller}
                    disabled={value <= ZOOM_MIN + 1e-9}
                    onClick={() => {
                      update(Math.max(ZOOM_MIN, Math.round((value - ZOOM_STEP) * 10) / 10));
                    }}
                  >
                    −
                  </button>
                  <span className="digits">{Math.round(value * 100)}%</span>
                  <button
                    type="button"
                    className="game-button"
                    aria-label={larger}
                    disabled={value >= ZOOM_MAX - 1e-9}
                    onClick={() => {
                      update(Math.min(ZOOM_MAX, Math.round((value + ZOOM_STEP) * 10) / 10));
                    }}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
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
        </div>
      </SettingsGroup>
      <SettingsGroup title={t("Цвета нотной записи")}>
        <div className="settings-list">
          <label className="setting">
            <span>{t("Цвет нот")}</span>
            <input
              type="color"
              aria-label={t("Цвет нот")}
              data-setting-target="note-color"
              value={prefs.noteColor}
              onChange={(event) => {
                onChange({ noteColor: event.target.value });
              }}
            />
          </label>
          <label className="setting">
            <span>{t("Цвет сыгранной ноты")}</span>
            <input
              type="color"
              aria-label={t("Цвет сыгранной ноты")}
              data-setting-target="played-note-color"
              value={prefs.playedNoteColor}
              onChange={(event) => {
                onChange({ playedNoteColor: event.target.value });
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
        </div>
      </SettingsGroup>
    </div>
  );
}
