// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { observePianoPaneReference, PianoPaneReference } from "./pianoPaneReference";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("piano workspace reference", () => {
  it("observes the external workspace and disables itself when another mode removes the marker", () => {
    let resize: (() => void) | undefined;
    let attributes: (() => void) | undefined;
    const resizeDisconnect = vi.fn();
    const attributesDisconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(update: () => void) {
          resize = update;
        }
        observe = vi.fn();
        disconnect = resizeDisconnect;
      }
    );
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(update: () => void) {
          attributes = update;
        }
        observe = vi.fn();
        disconnect = attributesDisconnect;
      }
    );
    const workspace = document.createElement("div");
    workspace.className = "workspace-main";
    workspace.dataset.pianoLayoutReference = "true";
    let height = 720;
    Object.defineProperty(workspace, "clientHeight", { get: () => height });
    const host = document.createElement("div");
    Object.defineProperty(host, "clientHeight", { value: 110 });
    workspace.append(host);
    document.body.append(workspace);
    const publish = vi.fn();
    const stop = observePianoPaneReference(host, publish);
    expect(publish).toHaveBeenLastCalledWith(720);
    height = 600;
    resize?.();
    expect(publish).toHaveBeenLastCalledWith(600);
    delete workspace.dataset.pianoLayoutReference;
    attributes?.();
    expect(publish).toHaveBeenLastCalledWith(undefined);
    stop();
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(attributesDisconnect).toHaveBeenCalledOnce();
  });

  it("invalidates layout only when a finite positive reference changes", () => {
    const relayout = vi.fn();
    const reference = new PianoPaneReference(relayout);
    reference.setHeight(700);
    reference.setHeight(700);
    expect(relayout).toHaveBeenCalledOnce();
    reference.setHeight(NaN);
    reference.setHeight(0);
    reference.setHeight(undefined);
    expect(relayout).toHaveBeenCalledTimes(2);
  });
});
