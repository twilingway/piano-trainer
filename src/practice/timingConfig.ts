export interface TimingConfig {
  readonly inputOffsets: Readonly<Record<string, number>>;
  readonly manualInputOffsetMs: number;
  readonly audioOffsetMs: number;
  readonly visualOffsetMs: number;
}

export function maximumInputCompensation(timing: TimingConfig): number {
  return Math.max(
    0,
    timing.manualInputOffsetMs,
    ...Object.values(timing.inputOffsets).map((offset) => offset + timing.manualInputOffsetMs)
  );
}
