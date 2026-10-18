export interface ExpressionNote {
  readonly start: number;
  readonly duration: number;
  readonly pitch: number;
}
export interface PerformerExpression {
  readonly blink: number;
  /** Positive yaw points toward higher notes; positive pitch looks up. Angles are radians. */
  readonly gazeYaw: number;
  readonly gazePitch: number;
  readonly eyeYaw: number;
  readonly eyePitch: number;
}
const RAD = Math.PI / 180;
const NEUTRAL: PerformerExpression = { blink: 0, gazeYaw: 0, gazePitch: 0, eyeYaw: 0, eyePitch: 0 };
const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Integer hashing schedules repeatable variation; it never samples a random generator. */
function variation(index: number, channel: number): number {
  let value = Math.imul((index | 0) ^ Math.imul(channel, 0x9e3779b9), 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function blinkPulse(time: number, start: number): number {
  const phase = (time - start) / 0.18;
  if (phase <= 0 || phase >= 1) return 0;
  return phase < 0.4 ? smooth(phase / 0.4) : 1 - smooth((phase - 0.4) / 0.6);
}
function eyeShift(time: number, period: number, channel: number): number {
  const index = Math.floor(time / period);
  const shift = smooth((time / period - index) / 0.18);
  const before = variation(index - 1, channel) * 2 - 1;
  return before + (variation(index, channel) * 2 - 1 - before) * shift;
}

/** Only song time drives the face: pauses freeze it and seeking needs no retained state. */
export function performerExpression(
  time: number,
  notes: readonly ExpressionNote[] = []
): PerformerExpression {
  if (!Number.isFinite(time) || time < 0 || time > Number.MAX_SAFE_INTEGER / 1000) return NEUTRAL;
  let blink = 0;
  const block = Math.floor(time / 5);
  for (let index = Math.max(0, block - 1); index <= block + 1; index++) {
    // Jittering a five-second grid by ±one second gives successive gaps of three to seven seconds.
    const start = index * 5 + 4 + (variation(index, 1) - 0.5) * 2;
    blink = Math.max(blink, blinkPulse(time, start));
    if (variation(index, 2) > 0.84) blink = Math.max(blink, blinkPulse(time, start + 0.3));
  }
  let sum = 0,
    register = 0;
  for (const note of notes) {
    if (
      !Number.isFinite(note.start) ||
      !Number.isFinite(note.duration) ||
      note.duration <= 0 ||
      !Number.isFinite(note.pitch)
    )
      continue;
    const centre = note.start + Math.min(1, note.duration) * 0.3;
    const distance = Math.abs(time - centre) / 2;
    if (distance >= 1) continue;
    const weight = (1 - distance * distance) ** 3 * Math.min(1, 0.2 + note.duration);
    // A continuous pitch register is intentionally broad: individual notes cannot flick the head.
    register += Math.max(-1, Math.min(1, (note.pitch - 60) / 24)) * weight;
    sum += weight;
  }
  const pitch = sum > 0 ? register / sum : 0;
  const attentionBlock = Math.floor(time / 8);
  const attention =
    sum > 0 && variation(attentionBlock, 3) > 0.35
      ? Math.sin(Math.PI * (time / 8 - attentionBlock)) ** 2 * Math.min(1, sum)
      : 0;
  return {
    blink,
    gazeYaw: attention > 0 ? 12 * RAD * pitch * attention : 0,
    gazePitch: attention > 0 ? -5 * RAD * attention : 0,
    eyeYaw: RAD * (0.8 * eyeShift(time, 0.85, 4) + 0.55 * pitch * attention),
    eyePitch: RAD * (0.6 * eyeShift(time, 1.13, 5) - 0.45 * attention)
  };
}
