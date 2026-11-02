import type { KeyEvent } from "../input/midiInput";
import { twoHandOwner } from "../reading/twoHandEvidence";
import { TWO_HAND_HORIZON_MS, TWO_HAND_WINDOW_MS } from "../reading/twoHandTypes";
import { compareHarmonyChord, validateHarmonyTarget } from "./harmony";
import type { HarmonyMismatch, HarmonyTarget } from "./harmony";

export interface HarmonyInputOrigin {
  readonly source: "midi" | "keyboard" | "pointer";
  readonly deviceId?: string;
  readonly channel?: number;
}
export interface HarmonyInputTiming {
  readonly correctedAtMs: number;
  readonly receivedAtMs: number;
  readonly ownerId?: string;
  readonly presentationId?: string;
}
export interface HarmonyPhysicalKey extends HarmonyInputOrigin {
  readonly pitch: number;
  readonly atMs: number;
  readonly correctedAtMs: number;
  readonly ownerId?: string;
}
interface PhysicalEvent extends HarmonyPhysicalKey {
  readonly kind: "down" | "up";
  readonly sequence: number;
}
export type HarmonyInputFailure = HarmonyMismatch | "too-slow" | "early-release" | "mixed-origin";
export interface HarmonyInputAttempt {
  readonly reason: HarmonyInputFailure;
  readonly firstAtMs: number;
  readonly failedAtMs: number;
}
export interface HarmonyInputSnapshot {
  readonly presentationId: string | null;
  readonly status:
    | "unpresented"
    | "ready"
    | "blocked"
    | "collecting"
    | "release"
    | "pending"
    | "accepted"
    | "overflow";
  readonly held: readonly HarmonyPhysicalKey[];
  readonly reason: HarmonyInputFailure | null;
  readonly attempts: readonly HarmonyInputAttempt[];
  readonly acceptedPitches: readonly number[];
  readonly commonPitches: readonly number[];
  readonly spreadMs: number | null;
  readonly completedAtMs: number | null;
}
export interface HarmonyInputOptions {
  readonly origin?: HarmonyInputOrigin;
  /** Existing two-hand delivery policy; a caller can supply its shared policy explicitly. */
  readonly deliveryGraceMs?: number;
}
export interface HarmonyPresentation {
  readonly id: string;
  readonly target: HarmonyTarget;
  readonly atMs: number;
  readonly correctedAtMs: number;
  /** Only continuously held owners from this machine's immediately preceding accepted chord qualify. */
  readonly retainCommonPitches?: readonly number[];
}
const time = (value: number): boolean =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;
const pitchValid = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 127;
const originKey = (origin: HarmonyInputOrigin): string =>
  JSON.stringify([origin.source, origin.deviceId ?? "", origin.channel ?? 0]);
const ownerKey = (key: HarmonyPhysicalKey): string => twoHandOwner(key);
const targetHas = (target: HarmonyTarget, pitch: number): boolean =>
  target.mode === "exact"
    ? target.pitches.includes(pitch)
    : target.pitches.some((value) => value % 12 === pitch % 12);
function validOrigin(value: HarmonyInputOrigin): boolean {
  return (
    ["midi", "keyboard", "pointer"].includes(value.source) &&
    (value.deviceId === undefined ||
      (typeof value.deviceId === "string" &&
        value.deviceId.length > 0 &&
        value.deviceId.length <= 512)) &&
    (value.channel === undefined ||
      (Number.isInteger(value.channel) && value.channel >= 1 && value.channel <= 16)) &&
    (value.source !== "midi" || (value.deviceId !== undefined && value.channel !== undefined))
  );
}
interface Replay {
  snapshot: HarmonyInputSnapshot;
  held: Map<string, HarmonyPhysicalKey>;
  accepted: Map<string, HarmonyPhysicalKey>;
}

/** Pure state machine. All raw, corrected and frame times come from the shell's session clock. */
export class HarmonyChordInput {
  private readonly grace: number;
  private presentation: HarmonyPresentation | null = null;
  private initial = new Map<string, HarmonyPhysicalKey>();
  private carried = new Set<string>();
  private events: PhysicalEvent[] = [];
  private sequence = 0;
  private now = 0;
  private overflow = false;
  constructor(private readonly options: HarmonyInputOptions = {}) {
    this.grace = options.deliveryGraceMs ?? TWO_HAND_HORIZON_MS;
    if (!time(this.grace) || this.grace > 1000 || (options.origin && !validOrigin(options.origin)))
      throw new RangeError("Invalid chord input policy");
  }
  present(presentation: HarmonyPresentation): HarmonyInputSnapshot {
    validateHarmonyTarget(presentation.target);
    if (
      !presentation.id ||
      !time(presentation.atMs) ||
      !time(presentation.correctedAtMs) ||
      presentation.atMs < this.now ||
      (presentation.retainCommonPitches ?? []).some((pitch) => !pitchValid(pitch))
    )
      throw new RangeError("Invalid chord presentation");
    const previous = this.replay();
    this.initial = previous.held;
    this.carried = new Set();
    if (previous.snapshot.status === "accepted") {
      for (const [owner, key] of previous.accepted) {
        const held = this.initial.get(owner);
        if (
          held === key &&
          presentation.retainCommonPitches?.includes(key.pitch) &&
          targetHas(presentation.target, key.pitch)
        )
          this.carried.add(owner);
      }
    }
    this.presentation = {
      ...presentation,
      target: { ...presentation.target, pitches: [...presentation.target.pitches] },
      retainCommonPitches: [...(presentation.retainCommonPitches ?? [])]
    };
    this.events = [];
    this.overflow = false;
    this.now = presentation.atMs;
    return this.snapshot();
  }
  /** Before the first presentation, input only tracks pre-held physical owners. */
  input(event: KeyEvent, timing: HarmonyInputTiming): HarmonyInputSnapshot {
    const raw = event.timestamp;
    if (
      raw === undefined ||
      !time(raw) ||
      !time(timing.correctedAtMs) ||
      !time(timing.receivedAtMs) ||
      timing.receivedAtMs < this.now ||
      timing.receivedAtMs < raw ||
      !pitchValid(event.pitch) ||
      !Number.isFinite(event.velocity) ||
      event.velocity < 0 ||
      event.velocity > 127 ||
      !["down", "up"].includes(event.type) ||
      !event.source ||
      !validOrigin({ ...event, source: event.source }) ||
      (timing.ownerId !== undefined &&
        (typeof timing.ownerId !== "string" ||
          timing.ownerId.length === 0 ||
          timing.ownerId.length > 512)) ||
      (timing.presentationId !== undefined && timing.presentationId !== this.presentation?.id)
    )
      return this.snapshot();
    const key: HarmonyPhysicalKey = {
      source: event.source,
      pitch: event.pitch,
      atMs: raw,
      correctedAtMs: timing.correctedAtMs,
      ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
      ...(event.channel === undefined ? {} : { channel: event.channel }),
      ...(timing.ownerId === undefined ? {} : { ownerId: timing.ownerId })
    };
    if (this.options.origin && originKey(this.options.origin) !== originKey(key))
      return this.snapshot();
    this.now = timing.receivedAtMs;
    const owner = ownerKey(key);
    if (timing.receivedAtMs - raw > this.grace) {
      // A stale release may clean up an owner, but can never complete an answer or carry proof.
      const previous = this.replay();
      const down = previous.held.get(owner);
      if (event.type === "up" && down && raw >= down.atMs) {
        this.initial = previous.held;
        this.initial.delete(owner);
        this.carried.clear();
        this.events = [];
        if (this.presentation) this.presentation = { ...this.presentation, atMs: this.now };
      }
      return this.snapshot();
    }
    if (!this.presentation) {
      const held = this.initial.get(owner);
      if (event.type === "down" && !held) this.initial.set(owner, key);
      if (event.type === "up" && held && raw >= held.atMs) this.initial.delete(owner);
      return this.snapshot();
    }
    if (this.events.length >= 256) {
      this.overflow = true;
      return this.snapshot();
    }
    this.events.push({ ...key, kind: event.type, sequence: this.sequence++ });
    return this.snapshot();
  }
  /** No timer is started. The adapter calls this with its existing frame/session time. */
  advance(nowMs: number): HarmonyInputSnapshot {
    if (time(nowMs)) this.now = Math.max(this.now, nowMs);
    return this.snapshot();
  }
  /** Loss of input cancels all physical evidence; it never fabricates releases or success. */
  reset(): void {
    this.presentation = null;
    this.initial.clear();
    this.carried.clear();
    this.events = [];
    this.overflow = false;
  }
  /** Runtime ownership handoff supplies physical keys only, never an accepted carry baseline. */
  seedHeld(keys: readonly HarmonyPhysicalKey[]): void {
    this.reset();
    for (const key of keys.slice(0, 128)) {
      if (
        pitchValid(key.pitch) &&
        time(key.atMs) &&
        time(key.correctedAtMs) &&
        validOrigin(key) &&
        (!this.options.origin || originKey(key) === originKey(this.options.origin))
      )
        this.initial.set(ownerKey(key), { ...key });
    }
  }
  snapshot(): HarmonyInputSnapshot {
    return this.replay().snapshot;
  }
  private replay(): Replay {
    const p = this.presentation;
    const held = new Map(this.initial);
    const retained = new Set(this.carried);
    let blocked = [...held.keys()].some((owner) => !retained.has(owner));
    let first: PhysicalEvent | null = null;
    let reason: HarmonyInputFailure | null = null;
    let complete: PhysicalEvent | null = null;
    let accepted = new Map<string, HarmonyPhysicalKey>();
    let spread: number | null = null;
    const attempts: HarmonyInputAttempt[] = [];
    const fail = (failure: HarmonyInputFailure, atMs: number): HarmonyInputFailure => {
      if (first) attempts.push({ reason: failure, firstAtMs: first.atMs, failedAtMs: atMs });
      complete = null;
      accepted.clear();
      spread = null;
      return failure;
    };
    for (const event of this.events.toSorted(
      (a, b) => a.atMs - b.atMs || a.sequence - b.sequence
    )) {
      // Replay the same policy boundary before later physical events, regardless of frame cadence.
      if (
        first &&
        !reason &&
        !complete &&
        event.atMs > first.atMs + TWO_HAND_WINDOW_MS + this.grace
      )
        reason = fail("too-slow", first.atMs + TWO_HAND_WINDOW_MS + this.grace);
      const owner = ownerKey(event);
      const down = held.get(owner);
      if (event.kind === "up") {
        if (!down || event.atMs < down.atMs) continue;
        held.delete(owner);
        retained.delete(owner);
        if (blocked && [...held.keys()].every((key) => retained.has(key))) blocked = false;
        if (
          p &&
          first &&
          !reason &&
          (!complete || event.correctedAtMs <= first.correctedAtMs + TWO_HAND_WINDOW_MS)
        )
          reason = fail("early-release", event.atMs);
        if (!held.size && !complete) {
          blocked = false;
          first = null;
          reason = null;
        }
        continue;
      }
      if (down) continue;
      held.set(owner, event);
      if (!p) continue;
      // Events outside a completed chord's attack window only update physical ownership.
      if (complete && first && event.correctedAtMs > first.correctedAtMs + TWO_HAND_WINDOW_MS)
        continue;
      if (event.atMs < p.atMs || event.correctedAtMs < p.correctedAtMs) {
        blocked = true;
        continue;
      }
      if (blocked || reason) continue;
      first ??= event;
      const firstOrigin = originKey(first);
      if ([...held.values()].some((key) => originKey(key) !== firstOrigin)) {
        reason = fail("mixed-origin", event.atMs);
        continue;
      }
      if (
        event.correctedAtMs < first.correctedAtMs ||
        event.correctedAtMs - first.correctedAtMs > TWO_HAND_WINDOW_MS
      ) {
        reason = fail("too-slow", event.atMs);
        continue;
      }
      const pitches = [...held.values()].map((key) => key.pitch);
      const comparison = compareHarmonyChord(p.target, pitches);
      if (comparison.reason === "missing-note") continue;
      if (comparison.reason) {
        reason = fail(comparison.reason, event.atMs);
        continue;
      }
      complete = event;
      spread = event.correctedAtMs - first.correctedAtMs;
      accepted = new Map(held);
    }
    if (
      p &&
      first &&
      !reason &&
      !complete &&
      this.now > first.atMs + TWO_HAND_WINDOW_MS + this.grace
    )
      reason = fail("too-slow", first.atMs + TWO_HAND_WINDOW_MS + this.grace);
    const status: HarmonyInputSnapshot["status"] = this.overflow
      ? "overflow"
      : !p
        ? "unpresented"
        : complete
          ? first && this.now > first.atMs + TWO_HAND_WINDOW_MS + this.grace
            ? "accepted"
            : "pending"
          : blocked
            ? "blocked"
            : reason
              ? "release"
              : first
                ? "collecting"
                : "ready";
    return {
      held,
      accepted,
      snapshot: {
        presentationId: p?.id ?? null,
        status,
        held: [...held.values()].map((key) => ({ ...key })),
        reason,
        attempts,
        acceptedPitches: [...accepted.values()].map((key) => key.pitch).sort((a, b) => a - b),
        commonPitches: [...accepted.entries()]
          .filter(([owner]) => this.carried.has(owner))
          .map(([, key]) => key.pitch),
        spreadMs: spread,
        completedAtMs: complete?.correctedAtMs ?? null
      }
    };
  }
}
