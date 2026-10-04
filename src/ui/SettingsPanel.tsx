import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { GameDialog } from "./GameDialog";

export interface SettingsTab {
  readonly id: string;
  readonly title: string;
  readonly content: ReactNode;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly tabs: readonly SettingsTab[];
}

/** Keep section selection while the panel is closed, with keyboard-accessible navigation. */
export function SettingsPanel({ open, onClose, tabs }: Props) {
  const id = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = useState(tabs[0]?.id ?? "");
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
    <GameDialog open={open} title="Настройки" className="settings" modal={false} onClose={onClose}>
      <div className="settings-layout">
        <div
          className="settings-navigation"
          role="tablist"
          aria-label="Разделы настроек"
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
          <span>Раздел настроек</span>
          <select
            className="game-select"
            aria-label="Раздел настроек"
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
          id={`${id}-panel`}
          className="settings-content tab-panel"
          role="tabpanel"
          aria-labelledby={shown ? `${id}-tab-${shown.id}` : undefined}
          tabIndex={0}
        >
          {shown?.content}
        </div>
      </div>
    </GameDialog>
  );
}
