import type { StaffPrefs } from "../../app/useStaffPrefs";
import { useI18n } from "../../app/useI18n";
import { SettingsGroup } from "./SettingsGroup";

export type PianoHintPrefs = Pick<
  StaffPrefs,
  | "labels"
  | "octaveLabels"
  | "keyboardFingers"
  | "fallingNoteNames"
  | "fallingFingers"
  | "noteNames"
  | "fingers"
  | "chords"
  | "fingerColors"
>;

interface Props {
  readonly prefs: PianoHintPrefs;
  readonly hasScore: boolean;
  readonly wordTyping: boolean;
  readonly onChange: (change: Partial<PianoHintPrefs>) => void;
}

/** Each hint control changes only its own representation's saved preference. */
export function PianoHintSettings({ prefs, hasScore, wordTyping, onChange }: Props) {
  const { t } = useI18n();
  const names = (key: "fallingNoteNames" | "noteNames", label: string) => (
    <label className="setting">
      <span>{label}</span>
      <select
        className="game-select"
        aria-label={label}
        value={prefs[key]}
        onChange={(event) => {
          onChange({ [key]: event.target.value as StaffPrefs["noteNames"] });
        }}
      >
        <option value="off">{t("Нет")}</option>
        <option value="ru">{t("До Ре Ми")}</option>
        <option value="en">{t("C D E")}</option>
      </select>
    </label>
  );
  const toggle = (
    key: "labels" | "octaveLabels" | "keyboardFingers" | "fallingFingers" | "fingers" | "chords",
    label: string
  ) => (
    <label className="setting">
      <span>{label}</span>
      <input
        type="checkbox"
        aria-label={label}
        checked={prefs[key]}
        onChange={(event) => {
          onChange({ [key]: event.target.checked });
        }}
      />
    </label>
  );
  return (
    <>
      {!wordTyping && (
        <>
          <SettingsGroup title={t("Подсказки на клавишах")}>
            <p className="setting-hint">{t("Наклейки показывают оба названия ноты: C4 и «до».")}</p>
            <div className="settings-list">
              {toggle("labels", t("Названия нот на клавишах"))}
              {toggle("octaveLabels", t("Номера октав на клавишах"))}
              {toggle("keyboardFingers", t("Номера пальцев на клавишах"))}
            </div>
          </SettingsGroup>
          <SettingsGroup title={t("Подсказки на падающих нотах")}>
            <p className="setting-hint">
              {t("Названия и номера пальцев можно показывать вместе или по отдельности.")}
            </p>
            <div className="settings-list">
              {names("fallingNoteNames", t("Названия на падающих нотах"))}
              {toggle("fallingFingers", t("Номера пальцев на падающих нотах"))}
            </div>
          </SettingsGroup>
        </>
      )}
      <SettingsGroup title={t("Подсказки на нотном стане")}>
        {hasScore ? (
          <>
            <p className="setting-hint">
              {t("Эти настройки применяются к нотному стану и пианинным табам.")}
            </p>
            <div className="settings-list">
              {names("noteNames", t("Названия на нотном стане"))}
              {toggle("fingers", t("Номера пальцев на нотном стане"))}
              {toggle("chords", t("Аккорды на нотном стане"))}
              <label className="setting">
                <span>{t("Цвет номеров пальцев на нотном стане")}</span>
                <select
                  className="game-select"
                  value={prefs.fingerColors}
                  aria-label={t("Цвет номеров пальцев на нотном стане")}
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
          </>
        ) : (
          <p className="setting-hint">
            {t("У этой песни нет нотной записи: она открыта из MIDI.")}
          </p>
        )}
      </SettingsGroup>
    </>
  );
}
