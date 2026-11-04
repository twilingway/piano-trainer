import { useEffect, type RefObject } from "react";
import type { Trainer } from "../practice/Trainer";
import type { TrainerReadingPolicy } from "../practice/readingPolicy";

export function useReadingTrainer(
  reading: {
    policy: TrainerReadingPolicy | null;
    session: { setActive: (active: boolean, atMs: number) => void } | null;
    blockedRef: RefObject<boolean>;
    suspend: () => void;
  },
  trainerRef: RefObject<Trainer | null>,
  ready: boolean,
  blocked: boolean
) {
  const { policy, session, blockedRef, suspend } = reading;
  useEffect(() => {
    blockedRef.current = blocked;
    if (blocked) suspend();
  }, [blocked, blockedRef, suspend]);
  useEffect(() => {
    if (!ready) return;
    const trainer = trainerRef.current;
    trainer?.configureCourse("reading", policy);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") suspend();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      trainer?.configureCourse("reading", null);
      document.removeEventListener("visibilitychange", onVisibility);
      session?.setActive(false, performance.now());
    };
  }, [trainerRef, ready, policy, session, suspend]);
}
