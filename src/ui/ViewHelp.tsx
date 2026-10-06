import { useI18n } from "../app/useI18n";
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
  const { t } = useI18n();
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="view-help__trigger"
        popoverTarget={id}
        aria-label={t("Подсказки к виду")}
        title={t("Подсказки к виду")}
      >
        i
      </button>
      <div
        id={id}
        popover="auto"
        className="view-help__popover"
        role="dialog"
        aria-label={t("Подсказки к виду")}
      >
        <div className="view-help__head">
          <strong>{t("Что показывать")}</strong>
          <button
            type="button"
            className="game-button"
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            {t("Закрыть")}
          </button>
        </div>
        <p>
          <StaffIcon />{" "}
          <span>
            <strong>{t("Нотный стан")}</strong> {t("— партитура над игрой.")}
          </span>
        </p>
        <p>
          <FallingNotesIcon />{" "}
          <span>
            <strong>{t("Падающие ноты")}</strong> {t("— лента нот над клавишами.")}
          </span>
        </p>
        <p>
          <KeyboardIcon />{" "}
          <span>
            <strong>{t("Клавиатура")}</strong> {t("— экранные клавиши.")}
          </span>
        </p>
        <p>
          <HandIcon />{" "}
          <span>
            <strong>{t("Руки")}</strong> {t("— положение рук и пальцев на клавишах.")}
          </span>
        </p>
        <p>
          <RoadIcon />{" "}
          <span>
            <strong>{t("Дорога")}</strong> {t("— ноты в перспективе.")}
          </span>
        </p>
        <p>
          <NoteCardIcon />{" "}
          <span>
            <strong>{t("Ноты на стане")}</strong> {t("— карточки вместо полосок.")}
          </span>
        </p>
        <p className="setting-hint">
          {t(
            "Включённые кнопки подсвечены. Руки видны только вместе с клавиатурой, дорога и карточки — только с падающими нотами."
          )}
        </p>
      </div>
    </>
  );
}
