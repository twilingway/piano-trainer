import { useI18n } from "../app/useI18n";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { CloseIcon } from "./icons";
import { WindowViewMemory } from "./windowViewMemory";
import { WindowDisclosureContext } from "./windowDisclosureContext";

interface Props {
  readonly open: boolean;
  readonly title: string;
  readonly className?: string;
  /** A modal takes the focus and dims the game; a panel leaves the game in view and working. */
  readonly modal?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly headerActions?: ReactNode;
  readonly memory?: WindowViewMemory;
}

/**
 * A native `<dialog>`: the browser keeps the focus inside a modal one and
 * closes it on Escape; this only mirrors `open` onto it.
 */
export function GameDialog({
  open,
  title,
  className,
  modal = true,
  onClose,
  children,
  headerActions,
  memory
}: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [localMemory] = useState(() => new WindowViewMemory());
  const viewMemory = memory ?? localMemory;
  const close = () => {
    if (open && body.current) viewMemory.capture("body", body.current);
    onClose();
  };
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (modal) dialog.showModal();
      else dialog.show();
    }
    if (open && body.current) viewMemory.restore("body", body.current);
    if (!open && dialog.open) dialog.close();
  }, [open, modal, viewMemory]);
  return (
    <dialog
      ref={ref}
      className={`game-dialog ${className ?? ""}`}
      aria-label={title}
      onClose={() => {
        if (open) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="game-dialog__head">
        <h2>{title}</h2>
        <div className="game-dialog__actions">
          {open ? headerActions : null}
          <button type="button" className="icon-button" aria-label={t("Закрыть")} onClick={close}>
            <CloseIcon />
          </button>
        </div>
      </header>
      <div
        key={open ? "open" : "closed"}
        ref={(element) => {
          body.current = element;
          if (!element) return;
          return () => {
            if (open) viewMemory.capture("body", element);
            if (body.current === element) body.current = null;
          };
        }}
        className="game-dialog__body"
      >
        <WindowDisclosureContext value={viewMemory}>{children}</WindowDisclosureContext>
      </div>
    </dialog>
  );
}
