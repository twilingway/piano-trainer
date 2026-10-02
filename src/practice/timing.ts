export interface ClockSegment {
  readonly performanceMs: number;
  readonly songSeconds: number;
  readonly speed: number;
  readonly acceptsInput: boolean;
}

/** Pure piecewise mapping. Old segments preserve event time across pauses and waits. */
export class SongTimeline {
  private segments: ClockSegment[] = [];

  reset(performanceMs: number, songSeconds: number, speed: number): void {
    this.segments = [{ performanceMs, songSeconds, speed, acceptsInput: true }];
  }

  anchor(performanceMs: number, songSeconds: number, speed: number, acceptsInput = true): void {
    const previous = this.segments.at(-1);
    if (previous && performanceMs < previous.performanceMs) return;
    this.segments.push({ performanceMs, songSeconds, speed, acceptsInput });
  }

  at(performanceMs: number, forInput = false): number | undefined {
    const segment = this.segmentAt(performanceMs);
    if (!segment || (forInput && !segment.acceptsInput)) return undefined;
    return segment.songSeconds + ((performanceMs - segment.performanceMs) / 1000) * segment.speed;
  }

  segmentAt(performanceMs: number): ClockSegment | undefined {
    for (let index = this.segments.length - 1; index >= 0; index--) {
      const segment = this.segments[index];
      if (segment && segment.performanceMs <= performanceMs) return segment;
    }
    return undefined;
  }

  performanceAt(songSeconds: number): number | undefined {
    const segment = this.segments.at(-1);
    if (!segment || segment.speed === 0) return undefined;
    return segment.performanceMs + ((songSeconds - segment.songSeconds) / segment.speed) * 1000;
  }
}

export function correctedInputTime(
  rawMs: number,
  inputOffsetMs: number,
  manualOffsetMs: number
): number {
  return rawMs - inputOffsetMs - manualOffsetMs;
}

export interface AudioClockAnchor {
  readonly performanceMs: number;
  readonly audioSeconds: number;
}

export function performanceToAudio(performanceMs: number, anchor: AudioClockAnchor): number {
  return anchor.audioSeconds + (performanceMs - anchor.performanceMs) / 1000;
}
