export interface TimingConfig {
  readonly inputOffsets: Readonly<Record<string, number>>;
  readonly manualInputOffsetMs: number;
  readonly audioOffsetMs: number;
  readonly visualOffsetMs: number;
}
