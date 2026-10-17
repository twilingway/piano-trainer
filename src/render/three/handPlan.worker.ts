import library from "../../../tools/hand-rig/poses/library/seven-nation-army.json";
import { planChunks } from "./handSolver/chunks";
import type { HandNotes, PlanChunk } from "./handSolver/chunks";
import { STUDIO_REST } from "./handSolver/rest";

// Plans the live hands off the frame loop and posts the plan in parts as it goes.

/** Ms of planning between two posted parts. */
const PART_MS = 100;

self.onmessage = (event: MessageEvent<HandNotes>) => {
  let last = performance.now();
  const due = () => {
    const now = performance.now();
    if (now - last < PART_MS) return false;
    last = now;
    return true;
  };
  for (const chunk of planChunks(STUDIO_REST, library, event.data, due))
    self.postMessage(chunk satisfies PlanChunk);
};
