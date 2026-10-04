import type { PracticeOptions } from "./session";

export type TimingPolicy = "learning" | "strict" | "waiting" | "listening";

/** The applied session policy, independent of the stored training preference. */
export function timingPolicy(
  options: Pick<PracticeOptions, "mode" | "hands" | "learningWindow">
): TimingPolicy {
  if (options.hands.size === 0) return "listening";
  if (options.mode === "wait") return "waiting";
  return options.learningWindow ? "learning" : "strict";
}
