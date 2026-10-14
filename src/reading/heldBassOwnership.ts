import { twoHandOwner } from "./twoHandEvidence";
import type { HeldBassInput } from "./heldBassTypes";

/** Prefix offs prevent a late physical down from recreating an already released owner. */
export function recordHeldBassOwner(
  held: Map<string, HeldBassInput>,
  releases: Map<string, number>,
  event: HeldBassInput,
  receivedAtMs: number
): void {
  const owner = twoHandOwner(event);
  const previous = held.get(owner);
  for (const [id, releasedAt] of releases) if (releasedAt < receivedAtMs - 250) releases.delete(id);
  if (event.kind === "up") {
    releases.set(owner, Math.max(event.atMs, releases.get(owner) ?? event.atMs));
    if (previous && event.atMs >= previous.atMs) held.delete(owner);
  } else if (!previous && event.atMs >= (releases.get(owner) ?? -1)) held.set(owner, event);
}
export function validHeldBassInput(event: HeldBassInput): boolean {
  const text = (value: unknown): boolean =>
    typeof value === "string" && value.length > 0 && value.length <= 512;
  return (
    Number.isFinite(event.atMs) &&
    event.atMs >= 0 &&
    Number.isInteger(event.pitch) &&
    event.pitch >= 0 &&
    event.pitch <= 127 &&
    ["midi", "keyboard", "pointer"].includes(event.source) &&
    ["up", "down"].includes(event.kind) &&
    Number.isFinite(event.offsetMs ?? 0) &&
    (event.channel === undefined ||
      (Number.isInteger(event.channel) && event.channel >= 1 && event.channel <= 16)) &&
    (event.ownerId === undefined || text(event.ownerId)) &&
    (event.deviceId === undefined || text(event.deviceId)) &&
    (event.runId === undefined || text(event.runId)) &&
    (event.presentationId === undefined || text(event.presentationId))
  );
}
