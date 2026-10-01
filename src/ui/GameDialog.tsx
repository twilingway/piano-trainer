import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { CloseIcon } from "./icons";

interface Props {
  readonly open: boolean;
  readonly title: string;
  readonly className?: string;
  /** A modal takes the focus and dims the game; a panel leaves the game in view and working. */
  readonly modal?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A native `<dialog>`: the browser keeps the focus inside a modal one and
 * closes it on Escape; this only mirrors `open` onto it.
 */
export function GameDialog({ open, title, className, modal = true, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (modal) dialog.showModal();
      else dialog.show();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, modal]);
  return (
    <dialog
      ref={ref}
      className={`game-dialog ${className ?? ""}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="game-dialog__head">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="game-dialog__body">{children}</div>
    </dialog>
  );
}
