import type { ReactNode } from "react";
import { GameModeSwitch } from "../ui/GameModeSwitch";
import { ConnectedWordSettings } from "./ConnectedSettings";
import type { TrainerSnapshot } from "../practice/Trainer";
import { PracticeTimingStatus, IndependentRhythmTimingStatus } from "../ui/PracticeTimingStatus";
export function practiceTimingStatus(
  independent: boolean,
  snapshot: { readonly timingPolicy?: TrainerSnapshot["timingPolicy"] | undefined },
  ranked: boolean
) {
  return independent ? (
    <IndependentRhythmTimingStatus />
  ) : (
    <PracticeTimingStatus policy={snapshot.timingPolicy} ranked={ranked} />
  );
}

export function practiceModeSwitch(
  enabled: boolean,
  playing: boolean,
  onChange: (enabled: boolean) => void,
  timing: ReactNode
) {
  return (
    <GameModeSwitch wordTyping={enabled} locked={playing} onChange={onChange}>
      {enabled && <ConnectedWordSettings />}
      {timing}
    </GameModeSwitch>
  );
}
