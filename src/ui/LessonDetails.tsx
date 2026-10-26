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
  const memory = useContext(WindowDisclosureContext);
  const [localMemory] = useState(() => new WindowViewMemory());
  const detailMemory = memory ?? localMemory;
  const [open, setOpen] = useState(() => memory?.detailOpen("body", id) ?? false);
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (open && ref.current) detailMemory.restoreDetails("body", ref.current);
  }, [open, detailMemory]);
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
