// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { GraphicsNotice } from "./GraphicsNotice";

afterEach(() => vi.unstubAllGlobals());

it.each(["unsupported", "unavailable", "lost"] as const)(
  "localizes %s and exposes retry",
  (failure) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setInterfaceLanguage("en");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const retry = vi.fn();
    act(() => {
      root.render(
        <GraphicsNotice failure={failure} open onClose={vi.fn()} onShow={vi.fn()} onRetry={retry} />
      );
    });
    expect(host.textContent).toContain("The library, settings, and score remain available.");
    const button = [...host.querySelectorAll("button")].find(
      (node) => node.textContent === "Retry graphics"
    );
    if (failure === "lost") {
      expect(button).toBeUndefined();
      expect(host.textContent).toContain("Waiting for graphics to recover…");
    } else {
      expect(button).toBeDefined();
      act(() => button?.click());
      expect(retry).toHaveBeenCalledOnce();
    }
    act(() => {
      root.unmount();
    });
    host.remove();
    setInterfaceLanguage("ru");
  }
);
