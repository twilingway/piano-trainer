import { useEffect } from "react";
import type { RefObject } from "react";
import type { Trainer } from "../practice/Trainer";

interface Controls {
  loop: boolean;
  ranked: boolean;
  stopOnError: boolean;
  rankedReady: boolean;
  deviceId: string;
  performance: boolean;
  canStart?: boolean;
}
export function useGameRuntime(
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  controls: Controls
): void {
  const {
    loop,
    ranked,
    stopOnError,
    rankedReady,
    deviceId,
    performance,
    canStart = true
  } = controls;
  useEffect(() => {
    trainerRef.current?.configureControls({
      loop: loop && !ranked,
      stopOnError: stopOnError && !ranked,
      canStart: canStart && (!ranked || rankedReady),
      performance,
      ...(ranked ? { allowedDeviceId: deviceId } : {})
    });
  }, [trainerRef, ready, loop, ranked, stopOnError, rankedReady, deviceId, performance, canStart]);
}
