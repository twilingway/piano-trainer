// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFullscreen } from "./useFullscreen";

let host: HTMLDivElement;
let root: Root;
let screenElement: Element | null;
let supported: boolean;
let request: ReturnType<typeof vi.fn>;
let exit: ReturnType<typeof vi.fn>;

function Harness() {
  const state = useFullscreen();
  return (
    <div onClickCapture={state.onClickCapture}>
      <button type="button">Settings</button>
      <output data-active={state.active}>{state.error}</output>
      <button type="button" data-fullscreen-toggle onClick={() => void state.toggle()}>
        Fullscreen
      </button>
    </div>
  );
}

async function mount() {
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
}

const active = () => host.querySelector("output")?.dataset.active === "true";
const error = () => host.querySelector("output")?.textContent;

async function click(toggle = false) {
  await act(async () => {
    const button = host.querySelectorAll("button")[toggle ? 1 : 0];
    button?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  screenElement = null;
  supported = true;
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, get: () => supported },
    fullscreenElement: { configurable: true, get: () => screenElement }
  });
  request = vi.fn(() => {
    screenElement = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  exit = vi.fn(() => {
    screenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: request
  });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  for (const key of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"])
    Reflect.deleteProperty(document, key);
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mobile fullscreen preference", () => {
  it("waits for a mobile button click and stores a successful entry", async () => {
    await mount();
    expect(request).not.toHaveBeenCalled();
    await click();
    expect(request).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(active()).toBe(true);
    expect(localStorage.getItem("fullscreen-preferred")).toBe("true");
  });

  it("does not automatically enter on desktop", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    await mount();
    await click();
    expect(request).not.toHaveBeenCalled();
    await click(true);
    expect(request).toHaveBeenCalledOnce();
  });

  it("keeps a saved exit across remount and permits an explicit entry", async () => {
    await mount();
    await click();
    await click(true);
    expect(exit).toHaveBeenCalledOnce();
    expect(localStorage.getItem("fullscreen-preferred")).toBe("false");
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    root = createRoot(host);
    await mount();
    await click();
    expect(request).toHaveBeenCalledOnce();
    await click(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(active()).toBe(true);
  });

  it("does not force reentry after exiting through the browser", async () => {
    await mount();
    await click();
    await act(async () => {
      await document.exitFullscreen();
    });
    await click();
    expect(request).toHaveBeenCalledOnce();
    expect(active()).toBe(false);
  });

  it("handles unavailable and rejected fullscreen without losing the UI", async () => {
    supported = false;
    await mount();
    await click();
    expect(request).not.toHaveBeenCalled();
    expect(error()).toBe("");
    await click(true);
    expect(error()).toContain("не поддерживает");
    supported = true;
    request.mockRejectedValue(new Error("denied"));
    await click(true);
    expect(active()).toBe(false);
    expect(error()).toContain("не разрешил");
  });
});
