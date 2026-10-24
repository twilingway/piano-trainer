import { useI18n } from "../app/useI18n";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { GameDialog } from "./GameDialog";

export type SettingsTab = {
  readonly id: string;
  readonly title: string;
} & (
  | { readonly content: ReactNode; readonly render?: never }
  | {
      readonly content?: never;
      readonly render: (navigate: (id: string, target?: string) => void) => ReactNode;
    }
);

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly tabs: readonly SettingsTab[];
}

/** Keep section selection while the panel is closed, with keyboard-accessible navigation. */
export function SettingsPanel({ open, onClose, tabs }: Props) {
  const { t } = useI18n();
  const id = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const panel = useRef<HTMLDivElement>(null);
  const processedNavigation = useRef(0);
  const [navigation, setNavigation] = useState<{ target: string | undefined; version: number }>({
    target: undefined,
    version: 0
  });
  const navigate = (id: string, target?: string) => {
    setActive(id);
    setNavigation((previous) => ({ target, version: previous.version + 1 }));
  };
  useLayoutEffect(() => {
    if (processedNavigation.current === navigation.version) return;
    processedNavigation.current = navigation.version;
    const target = navigation.target;
    if (!target) return;
    const element = panel.current?.querySelector<HTMLElement>(`[data-setting-target="${target}"]`);
    const control = element?.matches("input,select,button")
      ? element
      : element?.querySelector<HTMLElement>("input:not([type=hidden]),select,button,[tabindex]");
    const available = control && !control.matches(":disabled,[aria-disabled=true]");
    const destination = available
      ? control
      : (element?.closest<HTMLElement>("label,.settings-group") ?? panel.current);
    if (!destination) return;
    const previousTabIndex = destination.getAttribute("tabindex");
    if (!available) destination.setAttribute("tabindex", "-1");
    destination.scrollIntoView({ block: "center", behavior: "auto" });
    destination.focus({ preventScroll: true });
    destination.setAttribute("data-setting-highlight", "true");
    const clear = () => {
      destination.removeAttribute("data-setting-highlight");
      if (!available) {
        if (previousTabIndex === null) destination.removeAttribute("tabindex");
        else destination.setAttribute("tabindex", previousTabIndex);
      }
    };
    const timeout = window.setTimeout(clear, 1800);
    return () => {
      window.clearTimeout(timeout);
      clear();
    };
  }, [active, navigation, open]);
  const shown = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    const target = tabs[next];
    if (!target) return;
    event.preventDefault();
    setActive(target.id);
    buttons.current.get(target.id)?.focus();
  };
  return (
    <GameDialog
      open={open}
      title={t("Настройки")}
      className="settings"
      modal={false}
      onClose={onClose}
    >
      {open ? (
        <div className="settings-layout">
          <div
            className="settings-navigation"
            role="tablist"
            aria-label={t("Разделы настроек")}
            aria-orientation="vertical"
          >
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                ref={(button) => {
                  if (button) buttons.current.set(tab.id, button);
                  else buttons.current.delete(tab.id);
                }}
                id={`${id}-tab-${tab.id}`}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab.id === shown?.id}
                aria-controls={`${id}-panel`}
                tabIndex={tab.id === shown?.id ? 0 : -1}
                onKeyDown={(event) => {
                  handleKey(event, index);
                }}
                onClick={() => {
                  setActive(tab.id);
                }}
              >
                {tab.title}
              </button>
            ))}
          </div>
          <label className="settings-navigation-mobile">
            <span>{t("Раздел настроек")}</span>
            <select
              className="game-select"
              aria-label={t("Раздел настроек")}
              value={shown?.id ?? ""}
              onChange={(event) => {
                setActive(event.target.value);
              }}
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
          <div
            ref={panel}
            id={`${id}-panel`}
            className="settings-content tab-panel"
            role="tabpanel"
            aria-labelledby={shown ? `${id}-tab-${shown.id}` : undefined}
            tabIndex={0}
          >
            {shown?.render ? shown.render(navigate) : shown?.content}
          </div>
        </div>
      ) : null}
    </GameDialog>
  );
}
