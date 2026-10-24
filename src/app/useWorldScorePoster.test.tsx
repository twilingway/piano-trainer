// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useWorldScorePoster } from "./useWorldScorePoster";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { StaffWorldSource } from "../staff/staffWorldSnapshot";
it("binds one workspace source only after view readiness and restores the screen score immediately on exit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.body.appendChild(document.createElement("div")),
    root = createRoot(host);
  const view = { setWorldScoreSource: vi.fn() },
    viewRef = { current: view as unknown as FallingNotesView };
  let source: StaffWorldSource | undefined;
  const readBeat = () => 9;
  function Harness({ ready, enabled }: { ready: boolean; enabled: boolean }) {
    const result = useWorldScorePoster(viewRef, ready, enabled, readBeat);
    source = result.source;
    return <span>{result.hidden ? "hidden" : "shown"}</span>;
  }
  try {
    await act(async () => {
      root.render(<Harness ready={false} enabled />);
      await Promise.resolve();
    });
    expect(view.setWorldScoreSource).not.toHaveBeenCalled();
    await act(async () => {
      root.render(<Harness ready enabled />);
      await Promise.resolve();
    });
    expect(view.setWorldScoreSource).toHaveBeenLastCalledWith(source);
    await act(async () => {
      source?.setStatus("ready");
      await Promise.resolve();
    });
    expect(host.textContent).toBe("hidden");
    expect(source?.readBeat()).toBe(9);
    await act(async () => {
      root.render(<Harness ready enabled={false} />);
      await Promise.resolve();
    });
    expect(host.textContent).toBe("shown");
  } finally {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    host.remove();
  }
  expect(view.setWorldScoreSource).toHaveBeenLastCalledWith(undefined);
});
