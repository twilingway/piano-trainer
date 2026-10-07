// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRuntime } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

const { source } = vi.hoisted(() => ({
  source: { getSnapshot: vi.fn<() => PlayerRuntime>(), subscribe: vi.fn() }
}));
vi.mock("./PlayerRuntimeProvider", () => ({ useRuntimeSource: () => source }));

// These commands only inspect the owner's setter, not unrelated runtime resources.
const runtime = (setSpeed: PlayerRuntime["trainer"]["setSpeed"]): PlayerRuntime =>
  ({ trainer: { setSpeed } }) as PlayerRuntime;

let host: HTMLDivElement;
let root: Root;
let mountedCommand: ((speed: number) => void) | undefined;
const rendered = vi.fn();

function Probe({ multiplier }: { multiplier: number }) {
  const command = useRuntimeCommand((value) => (speed: number) => {
    value.trainer.setSpeed(speed * multiplier);
  });
  useLayoutEffect(() => {
    mountedCommand = command;
  }, [command]);
  rendered();
  return null;
}
function readCommand() {
  if (!mountedCommand) throw new Error("Command consumer is not mounted");
  return mountedCommand;
}
async function render(multiplier = 1) {
  await act(async () => {
    await Promise.resolve();
    root.render(<Probe multiplier={multiplier} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mountedCommand = undefined;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("stable runtime commands", () => {
  it("calls the latest published owner without subscribing or rerendering the caller", async () => {
    const original = vi.fn(),
      updated = vi.fn();
    source.getSnapshot.mockReturnValue(runtime(original));
    await render();
    const command = readCommand();
    command(0.5);
    expect(original).toHaveBeenCalledWith(0.5);
    source.getSnapshot.mockReturnValue(runtime(updated));
    command(0.75);
    expect(updated).toHaveBeenCalledWith(0.75);
    expect(original).toHaveBeenCalledOnce();
    expect(readCommand()).toBe(command);
    expect(rendered).toHaveBeenCalledOnce();
    expect(source.subscribe).not.toHaveBeenCalled();
  });

  it("uses the newest committed selector closure and keeps the exposed callback identity", async () => {
    const setSpeed = vi.fn();
    source.getSnapshot.mockReturnValue(runtime(setSpeed));
    await render();
    const command = readCommand();
    command(0.25);
    await render(2);
    expect(readCommand()).toBe(command);
    command(0.25);
    expect(setSpeed.mock.calls).toEqual([[0.25], [0.5]]);
  });
});
