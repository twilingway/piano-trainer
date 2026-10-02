export type ConnectionType = "usb" | "ble" | "local";
export type JitterQuality = "excellent" | "good" | "acceptable" | "unstable";
export interface CalibrationResult {
  inputOffsetMs: number;
  jitterMs: number;
  quality: JitterQuality;
  confidence: "high" | "medium" | "low";
  calibrationSamples: number[];
  rejectedSamples: number;
  complete: boolean;
}
export interface CalibrationProgress {
  warmup: number;
  measured: number;
  total: number;
  complete: boolean;
  result: CalibrationResult | null;
}
export const CALIBRATION_WARMUP = 4;
export const CALIBRATION_SAMPLES = 24;
export const CALIBRATION_PITCH = 60;
export const CALIBRATION_PERIOD_MS = 600;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function jitterQuality(jitterMs: number): JitterQuality {
  if (jitterMs <= 3) return "excellent";
  if (jitterMs <= 7) return "good";
  if (jitterMs <= 15) return "acceptable";
  return "unstable";
}

export function analyzeCalibration(samples: readonly number[]): CalibrationResult {
  const finite = samples.filter((sample) => Number.isFinite(sample));
  const center = median(finite);
  const initialMad = median(finite.map((sample) => Math.abs(sample - center)));
  // A 20 ms floor avoids rejecting natural variation when most taps are identical.
  const limit = Math.max(20, 3 * 1.4826 * initialMad);
  const accepted = finite.filter((sample) => Math.abs(sample - center) <= limit);
  const inputOffsetMs = median(accepted);
  const jitterMs = median(accepted.map((sample) => Math.abs(sample - inputOffsetMs)));
  const complete = finite.length >= CALIBRATION_SAMPLES && accepted.length >= 18;
  const quality = jitterQuality(jitterMs);
  const confidence =
    !complete || quality === "unstable" ? "low" : quality === "acceptable" ? "medium" : "high";
  return {
    inputOffsetMs,
    jitterMs,
    quality,
    confidence,
    calibrationSamples: accepted,
    rejectedSamples: samples.length - accepted.length,
    complete
  };
}

/** Associates each tap with a single known metronome beat, independently of callback time. */
export class CalibrationSession {
  private readonly taps = new Map<number, number>();
  constructor(
    readonly startPerformanceMs: number,
    readonly periodMs = CALIBRATION_PERIOD_MS
  ) {
    if (!Number.isFinite(startPerformanceMs) || !Number.isFinite(periodMs) || periodMs <= 0) {
      throw new RangeError("Invalid calibration timeline");
    }
  }
  capture(pitch: number, rawTimestampMs: number): boolean {
    if (pitch !== CALIBRATION_PITCH || !Number.isFinite(rawTimestampMs)) return false;
    const beat = Math.round((rawTimestampMs - this.startPerformanceMs) / this.periodMs);
    const expected = this.startPerformanceMs + beat * this.periodMs;
    if (
      beat < 0 ||
      beat >= CALIBRATION_WARMUP + CALIBRATION_SAMPLES ||
      Math.abs(rawTimestampMs - expected) > this.periodMs * 0.45 ||
      this.taps.has(beat)
    )
      return false;
    this.taps.set(beat, rawTimestampMs - expected);
    return true;
  }
  snapshot(): CalibrationProgress {
    let warmup = 0;
    const samples: number[] = [];
    for (const [beat, error] of this.taps) {
      if (beat < CALIBRATION_WARMUP) warmup++;
      else samples.push(error);
    }
    const complete = warmup === CALIBRATION_WARMUP && samples.length === CALIBRATION_SAMPLES;
    return {
      warmup,
      measured: samples.length,
      total: CALIBRATION_SAMPLES,
      complete,
      result: complete ? analyzeCalibration(samples) : null
    };
  }
}
