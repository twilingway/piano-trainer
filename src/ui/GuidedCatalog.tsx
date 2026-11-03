import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../app/useI18n";
import { WindowDisclosureContext } from "./windowDisclosureContext";
export function GuidedCatalog({ children }: { readonly children: ReactNode }) {
  const { t } = useI18n();
  const memory = useContext(WindowDisclosureContext);
  const [open, setOpen] = useState(() => memory?.detailOpen("body", "guided:catalog") ?? false);
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (open && ref.current) memory?.restoreDetails("body", ref.current);
  }, [open, memory]);
  return (
    <details
      ref={ref}
      className="guided-catalog"
      data-window-detail="guided:catalog"
      open={open}
      onToggle={(event) => {
        if (!event.currentTarget.open) memory?.captureDetails("body", event.currentTarget);
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{t("Все задания и прогресс")}</summary>
      {open && children}
    </details>
  );
}
