interface Candidate {
  readonly stage: "right" | "left" | "both";
  readonly at: number;
  readonly end: number;
  readonly evidence: string;
}

/** Mentions are evidence for review, never confirmed exercise boundaries. */
export function buildTimeline(transcript: unknown, start: number, end: number) {
  if (
    !transcript ||
    typeof transcript !== "object" ||
    !("segments" in transcript) ||
    !Array.isArray(transcript.segments)
  )
    throw new Error("В расшифровке нет массива segments.");
  const candidates: Candidate[] = [];
  for (const raw of transcript.segments as unknown[]) {
    if (!raw || typeof raw !== "object") throw new Error("Неверный формат сегмента расшифровки.");
    const segment = raw as { text?: unknown; start?: unknown; end?: unknown };
    if (
      typeof segment.text !== "string" ||
      typeof segment.start !== "number" ||
      typeof segment.end !== "number" ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < start ||
      segment.end > end + 0.15 ||
      segment.end < segment.start
    )
      throw new Error("Неверный формат или таймкод сегмента расшифровки.");
    const text = segment.text.toLocaleLowerCase("ru");
    const patterns = [
      ["right", /прав(?:ая|ой|ую)\s+рук/],
      ["left", /лев(?:ая|ой|ую)\s+рук/],
      ["both", /(?:обе(?:ими|их)?|двумя|две)\s+рук|соедин[а-яё]*\s+рук/]
    ] as const;
    for (const [stage, pattern] of patterns) {
      if (pattern.test(text))
        candidates.push({ stage, at: segment.start, end: segment.end, evidence: segment.text });
    }
  }
  return {
    reviewed: false,
    timebase: "absolute-video-seconds",
    note: "Кандидаты по словам преподавателя. Сверить начало этапа, табы, ноты и ритм по видео; ASR не распознаёт музыку в партитуру.",
    candidates
  };
}
