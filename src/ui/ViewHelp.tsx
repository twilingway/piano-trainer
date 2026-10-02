import { useId } from "react";

import {
  FallingNotesIcon,
  HandIcon,
  KeyboardIcon,
  NoteCardIcon,
  RoadIcon,
  StaffIcon
} from "./icons";

/** A touch-friendly alternative to hovering over the compact view buttons. */
export function ViewHelp() {
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="view-help__trigger"
        popoverTarget={id}
        aria-label="Подсказки к виду"
        title="Подсказки к виду"
      >
        i
      </button>
      <div
        id={id}
        popover="auto"
        className="view-help__popover"
        role="dialog"
        aria-label="Подсказки к виду"
      >
        <div className="view-help__head">
          <strong>Что показывать</strong>
          <button
            type="button"
            className="game-button"
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            Закрыть
          </button>
        </div>
        <p>
          <StaffIcon />{" "}
          <span>
            <strong>Нотный стан</strong> — партитура над игрой.
          </span>
        </p>
        <p>
          <FallingNotesIcon />{" "}
          <span>
            <strong>Падающие ноты</strong> — лента нот над клавишами.
          </span>
        </p>
        <p>
          <KeyboardIcon />{" "}
          <span>
            <strong>Клавиатура</strong> — экранные клавиши.
          </span>
        </p>
        <p>
          <HandIcon />{" "}
          <span>
            <strong>Руки</strong> — положение рук и пальцев на клавишах.
          </span>
        </p>
        <p>
          <RoadIcon />{" "}
          <span>
            <strong>Дорога</strong> — ноты в перспективе.
          </span>
        </p>
        <p>
          <NoteCardIcon />{" "}
          <span>
            <strong>Ноты на стане</strong> — карточки вместо полосок.
          </span>
        </p>
        <p className="setting-hint">
          Нажатая кнопка подсвечена. Руки доступны с клавиатурой, дорога и карточки — с падающими
          нотами.
        </p>
      </div>
    </>
  );
}
