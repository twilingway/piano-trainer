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
  return (
    <>
      <button
        type="button"
        className="view-toggle"
        aria-label="Нотный стан"
        aria-pressed={prefs.visible}
        title={prefs.visible ? "Скрыть нотный стан" : "Показать нотный стан"}
        disabled={!hasScore}
        onClick={() => {
          onChange({ visible: !prefs.visible });
        }}
      >
        <StaffIcon />
        <span className="view-toggle__label">Нотный стан</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label="Падающие ноты"
        aria-pressed={prefs.lane}
        title={prefs.lane ? "Скрыть падающие ноты" : "Показать падающие ноты"}
        onClick={() => {
          onChange({ lane: !prefs.lane });
        }}
      >
        <FallingNotesIcon />
        <span className="view-toggle__label">Падающие ноты</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label="Клавиатура"
        aria-pressed={prefs.keys}
        title={prefs.keys ? "Скрыть клавиатуру" : "Показать клавиатуру"}
        onClick={() => {
          onChange({ keys: !prefs.keys });
        }}
      >
        <KeyboardIcon />
        <span className="view-toggle__label">Клавиатура</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label="Руки"
        aria-pressed={prefs.hands}
        disabled={!prefs.keys}
        title={prefs.hands ? "Скрыть руки" : "Показать руки"}
        onClick={() => {
          onChange({ hands: !prefs.hands });
        }}
      >
        <HandIcon />
        <span className="view-toggle__label">Руки</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label="Дорога"
        aria-pressed={prefs.road}
        disabled={!prefs.lane}
        title={prefs.road ? "Обычный вид нот" : "Дорога: ноты в перспективе"}
        onClick={() => {
          onChange({ road: !prefs.road });
        }}
      >
        <RoadIcon />
        <span className="view-toggle__label">Дорога</span>
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-label="Ноты на стане"
        aria-pressed={prefs.noteCards}
        disabled={!prefs.lane}
        title={prefs.noteCards ? "Падающие ноты полосками" : "Падающие ноты нотами на стане"}
        onClick={() => {
          onChange({ noteCards: !prefs.noteCards });
        }}
      >
        <NoteCardIcon />
        <span className="view-toggle__label">Ноты на стане</span>
      </button>
    </>
  );
}
