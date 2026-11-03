// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Staff } from "./Staff";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  load: vi.fn<() => Promise<void>>(),
  clear: vi.fn()
}));

vi.mock("opensheetmusicdisplay", () => ({
  unitInPixels: 10,
  OpenSheetMusicDisplay: class {
    load = mocks.load;
    clear = mocks.clear;
  }
}));
vi.mock("./staffPresentation", () => ({ watchStaffPresentation: () => mocks.cancel }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("settles startup and cancels the pending presentation watcher when the score cannot load", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.load.mockRejectedValueOnce(new Error("Invalid MusicXML"));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const settled = vi.fn();
  try {
    await act(async () => {
      root.render(
        <Staff
          musicXml="broken"
          beat={0}
          zoom={1}
          noteColor="#fff"
          scoreColor="#fff"
          singleLine
          follow
          fingers
          fingerColors="mono"
          breaksFromScore={false}
          onLoadSettled={settled}
        />
      );
      await Promise.resolve();
    });
    expect(settled).toHaveBeenCalledOnce();
    expect(mocks.cancel).toHaveBeenCalledOnce();
  } finally {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    host.remove();
  }
});
