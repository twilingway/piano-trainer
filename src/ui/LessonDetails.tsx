import { GameDialog } from "./GameDialog";
import { useLessonWindow } from "./LessonWorkspace";
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../app/useI18n";
import { WindowDisclosureContext } from "./windowDisclosureContext";
import { WindowViewMemory } from "./windowViewMemory";

const LABELS = {
  guide: "Как выполнять задание",
  settings: "Параметры задания",
  progress: "Прогресс и история урока",
  more: "Другие задания курса"
} as const;

/** Only explicit disclosure mounts optional lesson content; the exercise keeps its own owner. */
export function LessonDetails({
  kind,
  id,
  children
}: {
  readonly kind: keyof typeof LABELS;
  readonly id: string;
  readonly children: ReactNode;
}) {
  const { t } = useI18n();
  const windows = useLessonWindow();
  const memory = useContext(WindowDisclosureContext);
  const [localMemory] = useState(() => new WindowViewMemory());
  const detailMemory = memory ?? localMemory;
  const [open, setOpen] = useState(() => memory?.detailOpen("body", id) ?? false);
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (open && ref.current) detailMemory.restoreDetails("body", ref.current);
  }, [open, detailMemory]);
  if (windows && kind !== "guide") {
    const modalOpen = windows.open === id;
    return (
      <div className="lesson-window-entry">
        <button
          type="button"
          className="game-button"
          onClick={() => {
            windows.onOpen(id);
          }}
        >
          {t(
            kind === "settings" && windows.interruptsAttempt
              ? "Параметры · остановить попытку"
              : LABELS[kind]
          )}
        </button>
        <GameDialog
          open={modalOpen}
          title={t(LABELS[kind])}
          onClose={() => {
            windows.onOpen(null);
          }}
        >
          {modalOpen ? (
            <div
              className="lesson-details__body"
              onClick={(event) => {
                if (
                  kind === "more" &&
                  event.target instanceof Element &&
                  event.target.closest("button")
                )
                  windows.onOpen(null);
              }}
            >
              {children}
            </div>
          ) : null}
        </GameDialog>
      </div>
    );
  }
  return (
    <details
      ref={ref}
      className="lesson-details"
      data-window-detail={id}
      open={open}
      onToggle={(event) => {
        if (!event.currentTarget.open) detailMemory.captureDetails("body", event.currentTarget);
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{t(LABELS[kind])}</summary>
      {open && <div className="lesson-details__body">{children}</div>}
    </details>
  );
}
