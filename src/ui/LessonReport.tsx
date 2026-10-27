import { useState, type ReactNode } from "react";
import { useI18n } from "../app/useI18n";
import { GameDialog } from "./GameDialog";
import { useLessonWindow } from "./LessonWorkspace";
import { LessonSlot } from "./LessonSlots";

export function LessonReport({
  children,
  summary
}: {
  readonly children: ReactNode;
  readonly summary: ReactNode;
}) {
  const { t } = useI18n();
  const windows = useLessonWindow();
  const [localOpen, setLocalOpen] = useState(false);
  const open = windows ? windows.open === "result" : localOpen;
  const setOpen = (next: boolean) => {
    if (windows) windows.onOpen(next ? "result" : null);
    else setLocalOpen(next);
  };
  if (!windows) return children;
  return (
    <>
      <LessonSlot name="feedback">
        <div className="lesson-result">
          <div className="lesson-result__summary" role="status">
            {summary}
          </div>
          <button
            type="button"
            className="game-button"
            onClick={() => {
              setOpen(true);
            }}
          >
            {t("Подробнее")}
          </button>
        </div>
      </LessonSlot>
      <GameDialog
        open={open}
        title={t("Подробный результат")}
        onClose={() => {
          setOpen(false);
        }}
      >
        {open ? children : null}
      </GameDialog>
    </>
  );
}
