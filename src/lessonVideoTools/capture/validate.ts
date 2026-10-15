import type { Calibration, HandFrame, Landmark, MusicPrediction, Review } from "./model.ts";

export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ожидается JSON-объект.");
  return value as Record<string, unknown>;
};
export const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown, min: number, max: number): boolean =>
  finite(value) && Number.isInteger(value) && value >= min && value <= max;
const texts = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => typeof item === "string" && item.trim().length > 0);
const side = (value: unknown): boolean => value === null || value === "left" || value === "right";
const finger = (value: unknown): boolean => value === null || integer(value, 1, 5);
const unit = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1;
const points = (value: unknown, count?: number): boolean =>
  Array.isArray(value) &&
  (count === undefined ? value.length >= 3 : value.length === count) &&
  value.every((item: unknown) => {
    const p = record(item);
    return (
      finite(p.x) && finite(p.y) && (count === undefined ? unit(p.x) && unit(p.y) : finite(p.z))
    );
  });

export function calibrationFrom(value: unknown, sourceSha256: string): Calibration {
  const data = record(value);
  if (
    data.schemaVersion !== 1 ||
    data.sourceSha256 !== sourceSha256 ||
    typeof data.mirrored !== "boolean" ||
    !Array.isArray(data.keys)
  )
    throw new Error("Калибровка несовместима с источником или форматом.");
  const pitches = new Set<number>();
  for (const item of data.keys) {
    const key = record(item);
    if (!integer(key.pitch, 0, 127) || !points(key.polygon) || pitches.has(key.pitch as number))
      throw new Error("Калибровка содержит неверную или повторную клавишу.");
    pitches.add(key.pitch as number);
    const polygon = key.polygon as { x: number; y: number }[];
    const area = polygon.reduce((sum, p, i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + (next ? p.x * next.y - next.x * p.y : 0);
    }, 0);
    if (Math.abs(area) < 1e-8) throw new Error("Область клавиши вырождена.");
  }
  if (data.roi !== undefined) {
    const roi = record(data.roi);
    if (
      !unit(roi.x) ||
      !unit(roi.y) ||
      !unit(roi.width) ||
      !unit(roi.height) ||
      roi.width <= 0 ||
      roi.height <= 0 ||
      roi.x + roi.width > 1 ||
      roi.y + roi.height > 1
    )
      throw new Error("ROI должен находиться внутри исходного кадра.");
  }
  return data as unknown as Calibration;
}

export function predictionFrom(value: unknown): MusicPrediction {
  const data = record(value);
  if (data.schemaVersion !== 1 || !Array.isArray(data.notes) || !texts(data.warnings))
    throw new Error("Неверный результат музыкальной модели.");
  record(data.backend);
  const ids = new Set<string>();
  for (const item of data.notes) {
    const note = record(item);
    if (
      typeof note.id !== "string" ||
      !note.id ||
      ids.has(note.id) ||
      !integer(note.pitch, 0, 127) ||
      !finite(note.onset) ||
      !finite(note.offset) ||
      note.offset <= note.onset ||
      !integer(note.velocity, 1, 127)
    )
      throw new Error("Неверная или повторная нота модели.");
    ids.add(note.id);
  }
  if (data.pedalCandidates !== undefined) {
    if (!Array.isArray(data.pedalCandidates)) throw new Error("Неверные кандидаты педали.");
    let previous = -Infinity;
    for (const item of data.pedalCandidates) {
      const pedal = record(item);
      if (
        !finite(pedal.time) ||
        pedal.time < 0 ||
        pedal.time < previous ||
        !integer(pedal.value, 0, 127) ||
        pedal.source !== "transkun" ||
        pedal.estimated !== true
      )
        throw new Error("Неверный или неупорядоченный кандидат педали.");
      previous = pedal.time;
    }
  }
  return data as unknown as MusicPrediction;
}

export function frameFrom(value: unknown): HandFrame {
  const frame = record(value);
  if (
    !integer(frame.frameIndex, 0, Number.MAX_SAFE_INTEGER) ||
    typeof frame.pts !== "string" ||
    !/^-?\d+$/.test(frame.pts) ||
    typeof frame.timeBase !== "string" ||
    !/^\d+\/[1-9]\d*$/.test(frame.timeBase) ||
    !finite(frame.time) ||
    !Array.isArray(frame.hands) ||
    !texts(frame.diagnostics)
  )
    throw new Error("Неверный кадр наблюдений рук.");
  const [num, den] = frame.timeBase.split("/").map(Number);
  if (!num || !den || Math.abs((Number(frame.pts) * num) / den - frame.time) > 0.000001)
    throw new Error("Время кадра не соответствует PTS.");
  const ids = new Set<string>();
  for (const item of frame.hands) {
    const hand = record(item);
    if (
      typeof hand.trackId !== "string" ||
      !hand.trackId ||
      ids.has(hand.trackId) ||
      !side(hand.side) ||
      !unit(hand.handednessScore) ||
      hand.worldIsEstimate !== true ||
      !points(hand.landmarks, 21) ||
      !points(hand.worldLandmarks, 21)
    )
      throw new Error("Неверное наблюдение кисти.");
    ids.add(hand.trackId);
  }
  return frame as unknown as HandFrame;
}

export function parseFrames(jsonl: string): HandFrame[] {
  const frames = jsonl
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => frameFrom(JSON.parse(line) as unknown));
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1],
      current = frames[i];
    if (
      previous &&
      current &&
      (current.frameIndex <= previous.frameIndex || current.time <= previous.time)
    )
      throw new Error("Кадры должны иметь строго возрастающие индекс и PTS.");
  }
  return frames;
}

export function reviewFrom(value: unknown, sourceSha256: string): Review {
  const data = record(value);
  if (data.schemaVersion !== 1 || data.sourceSha256 !== sourceSha256 || !Array.isArray(data.notes))
    throw new Error("Review несовместим с источником или форматом.");
  const inputs = record(data.inputs);
  for (const stage of ["music", "hands"])
    if (
      inputs[stage] !== null &&
      (typeof inputs[stage] !== "string" || !/^[a-f0-9]{64}$/.test(inputs[stage]))
    )
      throw new Error(
        "Review требует SHA-256 каждого результата или null для отсутствующего этапа."
      );
  for (const item of data.notes) {
    const patch = record(item);
    const permitted = new Set([
      "eventId",
      "pitch",
      "onset",
      "keyRelease",
      "hand",
      "teacherFinger",
      "writtenFinger",
      "computedFinger",
      "reviewNotes",
      "reviewFinger",
      "evidence",
      "reason"
    ]);
    if (
      Object.keys(patch).some((key) => !permitted.has(key)) ||
      typeof patch.eventId !== "string" ||
      !patch.eventId ||
      typeof patch.reason !== "string" ||
      !patch.reason.trim() ||
      !texts(patch.evidence) ||
      patch.evidence.length === 0
    )
      throw new Error("Исправлению нужны eventId, reason и evidence; неизвестные поля запрещены.");
    if (
      (Object.hasOwn(patch, "pitch") && !integer(patch.pitch, 0, 127)) ||
      (Object.hasOwn(patch, "onset") && !finite(patch.onset)) ||
      (Object.hasOwn(patch, "keyRelease") &&
        patch.keyRelease !== null &&
        !finite(patch.keyRelease)) ||
      (Object.hasOwn(patch, "hand") && !side(patch.hand))
    )
      throw new Error("Неверные значения исправления.");
    for (const field of ["teacherFinger", "writtenFinger", "computedFinger"])
      if (Object.hasOwn(patch, field) && !finger(patch[field]))
        throw new Error("Палец должен быть 1–5 или null.");
    for (const field of ["reviewNotes", "reviewFinger"])
      if (Object.hasOwn(patch, field) && typeof patch[field] !== "boolean")
        throw new Error("Статус проверки должен быть boolean.");
  }
  const hands = record(data.hands);
  if (!Array.isArray(hands.reviewedRanges) || !texts(hands.issues))
    throw new Error("Неверный статус проверки поз.");
  for (const item of hands.reviewedRanges) {
    const range = record(item);
    if (
      !finite(range.start) ||
      !finite(range.end) ||
      range.end <= range.start ||
      !texts(range.evidence) ||
      !range.evidence.length
    )
      throw new Error("Проверенный диапазон рук требует времени и evidence.");
  }
  return data as unknown as Review;
}

export function rawLandmarks(value: unknown): readonly Landmark[] {
  if (!points(value, 21)) throw new Error("Ожидается 21 точка.");
  return value as readonly Landmark[];
}
