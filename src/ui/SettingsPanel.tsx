import { useState } from "react";
import type { ReactNode } from "react";

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

/**
 * The settings, in tabs, beside the game rather than over it: a change shows
 * at once in the notes and the keys it is about.
 */
export function SettingsPanel({ open, onClose, tabs }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const shown = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <GameDialog open={open} title="Настройки" className="settings" modal={false} onClose={onClose}>
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab.id === shown?.id}
            onClick={() => {
              setActive(tab.id);
            }}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {shown?.content}
      </div>
    </GameDialog>
  );
}
