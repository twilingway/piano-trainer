import { AnimationMixer, LoopOnce } from "three";
import type { AnimationClip, Object3D } from "three";
import type { SourcePerformanceIdentity } from "../../song/sourcePerformance";

export interface NativePerformance {
  readonly sourcePerformanceId: string;
  readonly midiSha256: string;
  readonly sourceSha256: string;
  readonly durationSeconds: number;
  readonly timeOriginSeconds: number;
}
const matches = (a: NativePerformance, b: SourcePerformanceIdentity): boolean =>
  a.sourcePerformanceId === b.id &&
  a.midiSha256 === b.midiSha256 &&
  a.sourceSha256 === b.sourceSha256;

/** A short inspection clip must never masquerade as a complete performance. */
export function readNativePerformance(
  scene: Object3D,
  clip: AnimationClip | undefined,
  source: SourcePerformanceIdentity
): NativePerformance | undefined {
  const expected = source.durationSeconds;
  if (
    expected === undefined ||
    !Number.isFinite(expected) ||
    expected <= 0 ||
    source.timeOriginSeconds !== 0
  )
    return undefined;
  let binding: NativePerformance | undefined;
  scene.traverse((node) => {
    const p = node.userData;
    if (p.complete !== true || !clip || binding) return;
    if (
      typeof p.durationSeconds !== "number" ||
      !Number.isFinite(p.durationSeconds) ||
      Math.abs(p.durationSeconds - expected) > 0.04 ||
      typeof p.sourceEndSeconds !== "number" ||
      !Number.isFinite(p.sourceEndSeconds) ||
      p.sourceEndSeconds < expected - 0.04 ||
      !Number.isFinite(clip.duration) ||
      clip.duration < expected - 0.04 ||
      p.timeOriginSeconds !== 0
    )
      return;
    const candidate = {
      sourcePerformanceId: String(p.sourcePerformanceId),
      midiSha256: String(p.midiSha256),
      sourceSha256: String(p.sourceSha256),
      durationSeconds: p.durationSeconds,
      timeOriginSeconds: 0
    };
    if (matches(candidate, source)) binding = candidate;
  });
  return binding;
}

/** No delta clock, solver or retargeting: original bone curves sample the session's song time. */
export class NativePianistClip {
  private readonly mixer: AnimationMixer;
  private readonly action;
  constructor(
    private readonly scene: Object3D,
    clip: AnimationClip,
    readonly binding: NativePerformance
  ) {
    this.mixer = new AnimationMixer(scene);
    this.action = this.mixer.clipAction(clip);
    this.action.setLoop(LoopOnce, 1);
    this.action.clampWhenFinished = true;
  }
  sample(time: number, source: SourcePerformanceIdentity | undefined): boolean {
    if (!source || !matches(this.binding, source) || !Number.isFinite(time)) return false;
    this.action.reset().play();
    this.mixer.setTime(Math.max(0, Math.min(this.binding.durationSeconds, time)));
    this.scene.updateMatrixWorld(true);
    return true;
  }
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.scene);
  }
}
