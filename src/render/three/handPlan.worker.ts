import library from "../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { planChunks } from "./handSolver/chunks";
import type { HandNotes, HandRests } from "./handSolver/chunks";
import { fitScenePose } from "./handScenePose";
import type { SkinGeometry } from "./skinGeometry";
import type { Hand } from "../../fingering/fingering";
import type { PlanTiming } from "./handSolver/plan";
import type { ScenePlanChunk } from "./liveHands";
import { STUDIO_REST } from "./handSolver/rest";

// Plans the live hands off the frame loop and posts the plan in parts as it goes.

/** Ms of planning between two posted parts. */
const PART_MS = 100;

self.onmessage = (
  event: MessageEvent<{
    notes: HandNotes;
    rest?: HandRests;
    timing?: PlanTiming;
    skin?: Readonly<Record<Hand, SkinGeometry | undefined>>;
  }>
) => {
  let last = performance.now();
  let first = true;
  const due = () => {
    const now = performance.now();
    if (!first && now - last < PART_MS) return false;
    first = false;
    last = now;
    return true;
  };
  for (const chunk of planChunks(
    event.data.rest ?? STUDIO_REST,
    library,
    event.data.notes,
    due,
    event.data.timing
  ))
    self.postMessage({
      ...chunk,
      poses: chunk.poses.map((pose) =>
        fitScenePose(
          pose,
          event.data.rest?.[chunk.hand] ?? STUDIO_REST,
          chunk.hand,
          undefined,
          event.data.skin?.[chunk.hand]
        )
      ),
      sceneFit: true
    } satisfies ScenePlanChunk);
};
