import { GameDialog } from "./GameDialog";
import { useLessonWindow } from "./LessonWorkspace";
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../app/useI18n";
import { WindowDisclosureContext } from "./windowDisclosureContext";
import { LessonMenuItem } from "./LessonSlots";
import { WindowViewMemory } from "./windowViewMemory";

const LABELS = {
  guide: "Как выполнять задание",
  settings: "Параметры задания",
  progress: "Прогресс и история урока",
  more: "Другие задания курса"
} as const;
const MENU_LABELS: Readonly<Record<keyof typeof LABELS, string>> = {
  ...LABELS,
  progress: "История"
};

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
  const [guideOpen, setGuideOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (open && ref.current) detailMemory.restoreDetails("body", ref.current);
  }, [open, detailMemory]);
  if (windows) {
    // The guide stays out of the lesson window: an open lesson window suspends the attempt.
    const guide = kind === "guide";
    const modalOpen = guide ? guideOpen : windows.open === id;
    return (
      <>
        <LessonMenuItem
          kind={kind}
          label={t(MENU_LABELS[kind])}
          note={
            kind === "settings" && windows.interruptsAttempt ? t("остановит попытку") : undefined
          }
          onSelect={() => {
            if (guide) setGuideOpen(true);
            else windows.onOpen(id);
          }}
        />
        <GameDialog
          open={modalOpen}
          modal={!guide}
          {...(guide && { className: "lesson-theory-panel" })}
          title={t(LABELS[kind])}
          onClose={() => {
            if (guide) setGuideOpen(false);
            else windows.onOpen(null);
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
      </>
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
