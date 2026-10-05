import { useI18n } from "../app/useI18n";
import type { StaffPrefs } from "../app/useStaffPrefs";
import {
  FallingNotesIcon,
  HandIcon,
  KeyboardIcon,
  NoteCardIcon,
  RoadIcon,
  StaffIcon
} from "./icons";

interface Props {
  readonly prefs: StaffPrefs;
  /** The song has a score to show on the staff. */
  readonly hasScore: boolean;
  readonly onChange: (change: Partial<StaffPrefs>) => void;
}

/** What the game shows: the staff, the falling notes, the keys, the hands and their looks. */
export function ViewToggles({ prefs, hasScore, onChange }: Props) {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        className="view-toggle"
        aria-label={t("Нотный стан")}
        aria-pressed={prefs.visible}
        title={prefs.visible ? t("Скрыть нотный стан") : t("Показать нотный стан")}
        disabled={!hasScore}
        onClick={() => {
          onChange({ visible: !prefs.visible });
        }}
      >
        <StaffIcon />
        <span className="view-toggle__label">{t("Нотный стан")}</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label={t("Падающие ноты")}
        aria-pressed={prefs.lane}
        title={prefs.lane ? t("Скрыть падающие ноты") : t("Показать падающие ноты")}
        onClick={() => {
          onChange({ lane: !prefs.lane });
        }}
      >
        <FallingNotesIcon />
        <span className="view-toggle__label">{t("Падающие ноты")}</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label={t("Клавиатура")}
        aria-pressed={prefs.keys}
        title={prefs.keys ? t("Скрыть клавиатуру") : t("Показать клавиатуру")}
        onClick={() => {
          onChange({ keys: !prefs.keys });
        }}
      >
        <KeyboardIcon />
        <span className="view-toggle__label">{t("Клавиатура")}</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label={t("Руки")}
        aria-pressed={prefs.hands}
        disabled={!prefs.keys}
        title={prefs.hands ? t("Скрыть руки") : t("Показать руки")}
        onClick={() => {
          onChange({ hands: !prefs.hands });
        }}
      >
        <HandIcon />
        <span className="view-toggle__label">{t("Руки")}</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label={t("Дорога")}
        aria-pressed={prefs.road}
        disabled={!prefs.lane}
        title={prefs.road ? t("Обычный вид нот") : t("Дорога: ноты в перспективе")}
        onClick={() => {
          onChange({ road: !prefs.road });
        }}
      >
        <RoadIcon />
        <span className="view-toggle__label">{t("Дорога")}</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label={t("Ноты на стане")}
        aria-pressed={prefs.noteCards}
        disabled={!prefs.lane}
        title={prefs.noteCards ? t("Падающие ноты полосками") : t("Падающие ноты нотами на стане")}
        onClick={() => {
          onChange({ noteCards: !prefs.noteCards });
        }}
      >
        <NoteCardIcon />
        <span className="view-toggle__label">{t("Ноты на стане")}</span>
      </button>
    </>
  );
}
