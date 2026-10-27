import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type LessonSlotName = "exit" | "counter" | "hint" | "answer" | "feedback";

/** Menu groups in reading and Tab order; each item kind has its own place. */
export const LESSON_MENU_KINDS = [
  "newSeries",
  "repeat",
  "more",
  "guide",
  "settings",
  "progress"
] as const;
export type LessonMenuKind = (typeof LESSON_MENU_KINDS)[number];

interface LessonSlots {
  readonly targets: Readonly<Partial<Record<LessonSlotName, HTMLElement>>>;
  readonly menu: Readonly<Partial<Record<LessonMenuKind, HTMLElement>>>;
  readonly closeMenu: () => void;
}
export const LessonSlotContext = createContext<LessonSlots | null>(null);

/**
 * Inside the lesson workspace a panel's part moves to its fixed place in the
 * frame; outside it (catalog, tests) the part stays where the panel put it.
 */
export function LessonSlot({
  name,
  children
}: {
  readonly name: LessonSlotName;
  readonly children: ReactNode;
}) {
  const slots = useContext(LessonSlotContext);
  if (!slots) return children;
  const target = slots.targets[name];
  return target ? createPortal(children, target) : null;
}

export function useInLessonWorkspace() {
  return useContext(LessonSlotContext) !== null;
}

export function LessonMenuItem({
  kind,
  label,
  note,
  disabled,
  onSelect
}: {
  readonly kind: LessonMenuKind;
  readonly label: string;
  readonly note?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect: () => void;
}) {
  const slots = useContext(LessonSlotContext);
  const item = (
    <button
      type="button"
      className="game-button lesson-menu__item"
      disabled={disabled}
      onClick={() => {
        slots?.closeMenu();
        onSelect();
      }}
    >
      <span>{label}</span>
      {note ? <span className="lesson-menu__note">{note}</span> : null}
    </button>
  );
  if (!slots) return item;
  const target = slots.menu[kind];
  return target ? createPortal(item, target) : null;
}
