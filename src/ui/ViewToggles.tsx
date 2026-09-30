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
        aria-pressed={prefs.visible}
        title={prefs.visible ? "Скрыть нотный стан" : "Показать нотный стан"}
        disabled={!hasScore}
        onClick={() => {
          onChange({ visible: !prefs.visible });
        }}
      >
        <StaffIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={prefs.lane}
        title={prefs.lane ? "Скрыть падающие ноты" : "Показать падающие ноты"}
        onClick={() => {
          onChange({ lane: !prefs.lane });
        }}
      >
        <FallingNotesIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={prefs.keys}
        title={prefs.keys ? "Скрыть клавиатуру" : "Показать клавиатуру"}
        onClick={() => {
          onChange({ keys: !prefs.keys });
        }}
      >
        <KeyboardIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={prefs.hands}
        disabled={!prefs.keys}
        title={prefs.hands ? "Скрыть руки" : "Показать руки"}
        onClick={() => {
          onChange({ hands: !prefs.hands });
        }}
      >
        <HandIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={prefs.road}
        disabled={!prefs.lane}
        title={prefs.road ? "Обычный вид нот" : "Дорога: ноты в перспективе"}
        onClick={() => {
          onChange({ road: !prefs.road });
        }}
      >
        <RoadIcon />
      </button>
      <button
        type="button"
        className="view-toggle"
        aria-pressed={prefs.noteCards}
        disabled={!prefs.lane}
        title={prefs.noteCards ? "Падающие ноты полосками" : "Падающие ноты нотами на стане"}
        onClick={() => {
          onChange({ noteCards: !prefs.noteCards });
        }}
      >
        <NoteCardIcon />
      </button>
    </>
  );
}
