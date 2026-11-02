import type { RefObject } from "react";
import type { Trainer } from "../practice/Trainer";
import type { PreparationStatus } from "./TrainerPreparation";
interface Audio {
  readonly foreground: boolean;
  readonly cancel: () => void;
}
interface Controls {
  readonly preparation: { readonly status: PreparationStatus; readonly cancel: () => void };
  readonly trainerRef: RefObject<Pick<Trainer, "setPlaying"> | null>;
}
/** A repeated Play cancels the pending start instead of creating a second countdown. */
export function preparationTransport(
  play: () => void,
  cancelCountdown: () => void,
  audio: Audio,
  trainer: Controls
) {
  const cancel = () => {
    cancelCountdown();
    audio.cancel();
    trainer.preparation.cancel();
    trainer.trainerRef.current?.setPlaying(false);
  };
  return {
    cancel,
    play: () => {
      if (
        audio.foreground ||
        trainer.preparation.status === "preparing" ||
        trainer.preparation.status === "waiting-frame"
      )
        cancel();
      else play();
    }
  };
}
