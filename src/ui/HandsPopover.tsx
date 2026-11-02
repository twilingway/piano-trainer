import { useId, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../app/useI18n";
import { ROLE_TITLE } from "../song/midiParts";
import { CompactPracticeChoices, HAND_CHOICES, HandsPicture } from "./CompactPracticeChoices";
import type { PartsChoice } from "./CompactPracticeChoices";
import type { HandsChoice, PracticeModeChoice } from "./PlayerTopBar";

interface Props {
  readonly hands: HandsChoice;
  readonly mode: PracticeModeChoice;
  readonly parts?: PartsChoice | undefined;
  readonly disabled?: boolean | undefined;
  readonly onHands: (hands: HandsChoice) => void;
  readonly onMode: (mode: PracticeModeChoice) => void;
  readonly onOpen: () => void;
}

/** The hand button opens only the choices needed to start playing. */
export function HandsPopover(props: Props) {
  const { t } = useI18n();
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const title = t(
    props.parts?.role
      ? ROLE_TITLE[props.parts.role]
      : (HAND_CHOICES.find((choice) => choice.value === props.hands)?.title ?? "Руки")
  );
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    const button = trigger.current;
    const menu = panel.current;
    const container = host.current;
    if (!open || !button || !menu || !container) return;
    const shell = container.closest(".shell-top");
    const progress = shell?.querySelector(".song-progress");
    const position = () => {
      const anchor = button.getBoundingClientRect();
      const minimum = Math.max(
        8,
        progress
          ? progress.getBoundingClientRect().bottom + 4
          : (shell?.querySelector(".topbar")?.getBoundingClientRect().top ?? 8)
      );
      const height = Math.max(1, window.innerHeight - minimum - 8);
      menu.style.maxHeight = `${String(height)}px`;
      const right = Math.max(8, window.innerWidth - anchor.left + 8);
      menu.style.right = `${String(right)}px`;
      menu.style.maxWidth = `${String(Math.max(1, window.innerWidth - right - 8))}px`;
      const top = Math.max(
        minimum,
        Math.min(anchor.top, window.innerHeight - menu.getBoundingClientRect().height - 8)
      );
      menu.style.top = `${String(top)}px`;
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      button.focus({ preventScroll: true });
    };
    position();
    menu
      .querySelector<HTMLButtonElement>('.compact-practice__hands [aria-checked="true"]')
      ?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    observer.observe(button);
    if (progress) observer.observe(progress);
    window.addEventListener("resize", position);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  const parts = props.parts;
  return (
    <div className="compact-hands" ref={host}>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label={t("Выбор рук: {hands}", { hands: title })}
        title={t("{hands} — выбрать руки", { hands: title })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        disabled={props.disabled}
        onClick={() => {
          if (!open) props.onOpen();
          setOpen(!open);
        }}
      >
        <HandsPicture hands={props.hands} />
      </button>
      {open && (
        <div
          className="hands-popover"
          id={id}
          ref={panel}
          role="dialog"
          aria-label={t("Как играть")}
        >
          <CompactPracticeChoices
            concise
            hands={props.hands}
            mode={props.mode}
            onMode={props.onMode}
            onHands={(hands) => {
              props.onHands(hands);
              close();
            }}
            parts={
              parts
                ? {
                    ...parts,
                    onRole: (role) => {
                      parts.onRole(role);
                      close();
                    }
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
