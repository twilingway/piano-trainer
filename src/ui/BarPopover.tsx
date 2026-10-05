import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  readonly className?: string;
  /** What the button shows; `label` names it for a screen reader and the tooltip. */
  readonly summary: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * A window hanging from a button of the bar. It closes on its button, a press
 * outside and Escape, and leaves no focus inside: a focused list would keep
 * the word mode's letters from the game.
 */
export function BarPopover(props: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const details = ref.current;
    if (!open || !details) return;
    const close = () => {
      details.open = false;
    };
    const press = (event: PointerEvent) => {
      if (event.target instanceof Node && !details.contains(event.target)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  return (
    <details
      ref={ref}
      className={`bar-popover${props.className ? ` ${props.className}` : ""}`}
      onToggle={(event) => {
        const details = event.currentTarget;
        setOpen(details.open);
        if (!details.open && document.activeElement instanceof HTMLElement) {
          if (details.contains(document.activeElement)) document.activeElement.blur();
        }
      }}
    >
      <summary
        className="game-button bar-popover__button"
        aria-label={props.label}
        title={props.label}
      >
        {props.summary}
      </summary>
      <div className="bar-popover__panel">{props.children}</div>
    </details>
  );
}
