// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishOverlayLayout } from "./viewOverlayLayout";

afterEach(() => {
  document.body.replaceChildren();
});

describe("piano reservation publication", () => {
  it("publishes to its lanes and notifies the workspace only when the reservation changes", () => {
    const workspace = document.createElement("div");
    const lanes = document.createElement("div");
    lanes.className = "lanes";
    const host = document.createElement("div");
    lanes.append(host);
    workspace.append(lanes);
    document.body.append(workspace);
    const changed = vi.fn();
    workspace.addEventListener("piano-layout-footprint", changed);
    publishOverlayLayout(host, 10, 140, 0, 152.4, 124.5);
    expect(host.style.getPropertyValue("--keys-height")).toBe("124.5px");
    expect(lanes.style.getPropertyValue("--piano-required-height")).toBe("153px");
    expect(workspace.style.getPropertyValue("--piano-required-height")).toBe("");
    expect(changed).toHaveBeenCalledOnce();
    expect((changed.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ requiredHeight: 152.4 });
    publishOverlayLayout(host, 300, 430, 0, 152.4);
    expect(changed).toHaveBeenCalledOnce();
    publishOverlayLayout(host, 300, 430, 0);
    expect(lanes.style.getPropertyValue("--piano-required-height")).toBe("");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(host.style.getPropertyValue("--hit-line")).toBe("300px");
  });
});
