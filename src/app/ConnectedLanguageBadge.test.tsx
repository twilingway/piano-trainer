// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectedLanguageBadge } from "./ConnectedLanguageBadge";
import { LANGUAGE_STORAGE_KEY, setInterfaceLanguage } from "./interfaceLanguage";
import { AboutSettings } from "../ui/settings/AboutSettings";

afterEach(() => {
  setInterfaceLanguage("ru");
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  vi.unstubAllGlobals();
});

it("toggles from the badge, persists the choice and stays synchronized with settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => {
      await Promise.resolve();
      root.render(
        <>
          <ConnectedLanguageBadge />
          <AboutSettings
            build={{ version: "0.0.67", sha: "", pr: null, builtAt: "2026-10-05T12:00:00Z" }}
          />
        </>
      );
    });
    const badge = host.querySelector<HTMLButtonElement>(".topbar-language");
    expect(badge?.textContent).toBe("RU");
    expect(badge?.getAttribute("title")).toContain("→ English");
    await act(async () => {
      await Promise.resolve();
      badge?.click();
    });
    expect(badge?.textContent).toBe("EN");
    expect(badge?.getAttribute("aria-label")).toContain("Interface language");
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Interface language"]');
    expect(select?.value).toBe("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    await act(async () => {
      await Promise.resolve();
      if (!select) throw new Error("Language selector missing");
      select.value = "ru";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(badge?.textContent).toBe("RU");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ru");
  } finally {
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    host.remove();
  }
});
