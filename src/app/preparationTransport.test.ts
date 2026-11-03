import { describe, expect, it, vi } from "vitest";
import { preparationTransport } from "./preparationTransport";
import type { PreparationStatus } from "./TrainerPreparation";
function controls(foreground: boolean, status: PreparationStatus) {
  const audio = { foreground, cancel: vi.fn() };
  const trainer = {
    preparation: { status, cancel: vi.fn() },
    trainerRef: { current: { setPlaying: vi.fn() } }
  };
  const play = vi.fn(),
    cancelCountdown = vi.fn();
  return {
    audio,
    trainer,
    play,
    cancelCountdown,
    actions: preparationTransport(play, cancelCountdown, audio, trainer)
  };
}
describe("preparation transport", () => {
  it.each([
    { foreground: true, status: "idle" as const },
    { foreground: false, status: "preparing" as const },
    { foreground: false, status: "waiting-frame" as const }
  ])(
    "routes repeated Play to cancellation instead of a new countdown: %j",
    ({ foreground, status }) => {
      const h = controls(foreground, status);
      h.actions.play();
      expect(h.play).not.toHaveBeenCalled();
      expect(h.cancelCountdown).toHaveBeenCalledOnce();
      expect(h.audio.cancel).toHaveBeenCalledOnce();
      expect(h.trainer.preparation.cancel).toHaveBeenCalledOnce();
      expect(h.trainer.trainerRef.current.setPlaying).toHaveBeenCalledWith(false);
    }
  );
  it("uses exactly the same cancellation command for the panel and keeps ordinary Play unchanged", () => {
    const h = controls(false, "idle");
    h.actions.play();
    expect(h.play).toHaveBeenCalledOnce();
    expect(h.cancelCountdown).not.toHaveBeenCalled();
    h.actions.cancel();
    expect(h.cancelCountdown).toHaveBeenCalledOnce();
    expect(h.audio.cancel).toHaveBeenCalledOnce();
    expect(h.trainer.preparation.cancel).toHaveBeenCalledOnce();
  });
});
