import MidiPackage from "@tonejs/midi";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { captureDirectory, readCapture } from "./acquire.ts";
import { evidence } from "./evidence.ts";
import { readStage } from "./inference.ts";
import { applyReview, bindReview, captureNotes } from "./model.ts";
import type { Calibration, CapturedNote, Review } from "./model.ts";
import type { CaptureOptions } from "./options.ts";
import { calibrationFrom, parseFrames, predictionFrom, reviewFrom } from "./validate.ts";
import { assertNoLink, digest, exists, readJson, safeDirectory, writeJson } from "../runtime.ts";

const { Midi } = MidiPackage;

/** MIDI cannot encode unknown note-offs; every chosen interval is described in notes.json. */
export function notesMidi(notes: readonly CapturedNote[]): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  for (const hand of ["left", "right", null] as const) {
    const selected = notes.filter((note) => note.hand === hand);
    if (!selected.length) continue;
    const track = midi.addTrack();
    track.name = hand ?? "unassigned";
    for (const note of selected) {
      const end = note.keyRelease ?? note.estimatedOffset;
      if (note.onset < 0 || end <= note.onset)
        throw new Error(
          "MIDI требует неотрицательного времени и положительной длительности; исправьте review."
        );
      track.addNote({
        midi: note.pitch,
        time: note.onset,
        duration: end - note.onset,
        velocity: note.velocity / 127
      });
    }
  }
  return midi.toArray();
}

export function reviewStatus(
  notes: readonly CapturedNote[],
  review: Review | null,
  start: number,
  end: number
): { notes: string; fingers: string; hands: string } {
  const ranges = [...(review?.hands.reviewedRanges ?? [])].sort((a, b) => a.start - b.start);
  let until = start;
  for (const range of ranges) {
    if (range.start > until) break;
    until = Math.max(until, range.end);
  }
  return {
    notes:
      notes.length === 0
        ? "missing"
        : notes.every((note) => note.review.notes)
          ? "reviewed"
          : "draft",
    fingers:
      notes.length === 0
        ? "missing"
        : notes.every((note) => note.review.finger)
          ? "reviewed"
          : "draft",
    hands: review?.hands.issues.length === 0 && until >= end ? "reviewed" : "draft"
  };
}

const HANDOFF = `# Данные для Claude Code

Пакет содержит наблюдения исполнения, без привязки к скелету или Blender.
Откройте manifest.json: missing/draft/reviewed указаны отдельно для нот, пальцев и поз.
Проверенная музыка не означает проверенные позы. При draft сначала сверяйте evidence.

## Время и координаты

Время — исходные медиасекунды PTS * timeBase, не frameIndex/FPS.
source.timelineOriginSeconds сообщает первое время видео, audio.sourceOffset — начало аудио.
Если нужна шкала анимации от нуля, вычитайте одно и то же начало из нот и кадров.
frameIndex относится ко всему исходнику, включая кадры перед выбранным диапазоном.
Landmarks x/y нормализованы по полному исходному изображению: X вправо, Y вниз.
Изображение не отражено; mirrored в calibration описывает ракурс, а не преобразование точек.
Landmarks z — относительная модельная глубина от запястья, НЕ мировые метры.
worldLandmarks — оценка модели в метрах с центром в кисти, НЕ положение руки в сцене.
Оси модели сохраняются как выданы MediaPipe; глубина к камере уменьшается.
Не переводите эти точки в глобальную сцену одним масштабом: необходима калибровка камеры.

## Суставы

0 запястье; 1–4 большой палец (CMC, MCP, IP, кончик);
5–8 указательный, 9–12 средний, 13–16 безымянный, 17–20 мизинец
(для каждого MCP, PIP, DIP, кончик). Нумерация пальцев в notes: 1 большой … 5 мизинец.
trackId связывает наблюдения, side может быть null. Новый ID после потери/неоднозначности
не означает новую физическую руку. Пустые hands и diagnostics — явные пропуски, не поза покоя.
Изначальные оценки handedness не доказывают анатомическую сторону.

## Ноты и сверка

teacherFinger, writtenFinger, computedFinger имеют независимое происхождение.
candidates — близость кончика к области клавиши; это НЕ подтверждение нажатия.
offset/estimatedOffset — предсказание модели. keyRelease — отдельно подтверждённое отпускание.
acousticEnd может быть неизвестным; педаль не доказывает удержание пальцем.
MIDI использует keyRelease либо estimatedOffset и не переносит неопределённость JSON.
Каждый экспортный note-off имеет это правило в notes.json; JSON — главный источник.
evidence/index.json связывает JPG с исходными кадрами и PTS.
review.json хранит ручные решения отдельно от raw; никаких скрытых исправлений landmarks.
Ретаргетинг, IK, восстановление скрытых суставов и сборка анимации выполняются отдельно.
`;

async function collectFiles(directory: string, relative = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(resolve(directory, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("Ссылки в bundle запрещены.");
    if (entry.isDirectory()) result.push(...(await collectFiles(directory, name)));
    else result.push(name);
  }
  return result.sort();
}

export async function exportCapture(root: string, options: CaptureOptions): Promise<void> {
  const source = await readCapture(root, options.id);
  const directory = captureDirectory(root, options.id);
  const musicReceipt = await readStage(directory, "music", source.video.sha256);
  const handsReceipt = await readStage(directory, "hands", source.video.sha256);
  const rawMusic = musicReceipt
    ? predictionFrom(await readJson(resolve(directory, "music.raw.json")))
    : null;
  const frames = handsReceipt
    ? parseFrames(await readFile(resolve(directory, "hands.raw.jsonl"), "utf8"))
    : [];
  const savedCalibration = handsReceipt?.parameters.calibration;
  const calibration = options.calibration
    ? calibrationFrom(await readJson(resolve(options.calibration)), source.video.sha256)
    : savedCalibration
      ? calibrationFrom(savedCalibration, source.video.sha256)
      : null;
  if (
    savedCalibration &&
    calibration &&
    (savedCalibration as Calibration).mirrored !== calibration.mirrored
  )
    throw new Error("Зеркальность отличается от этапа hands. Повторите анализ с новым id.");
  const empty: Calibration = {
    schemaVersion: 1,
    sourceSha256: source.video.sha256,
    mirrored: false,
    keys: []
  };
  let notes = captureNotes(rawMusic?.notes ?? [], frames, calibration ?? empty);
  const review = options.review
    ? reviewFrom(await readJson(resolve(options.review)), source.video.sha256)
    : null;
  if (review) {
    bindReview(review, {
      music: musicReceipt?.files["music.raw.json"] ?? null,
      hands: handsReceipt?.files["hands.raw.jsonl"] ?? null
    });
    notes = applyReview(notes, review);
  }
  const bundle = resolve(directory, options.bundle);
  if (await exists(bundle)) throw new Error("Bundle уже существует. Укажите новое имя --bundle.");
  await safeDirectory(root, bundle);
  await writeJson(resolve(bundle, "source.json"), source);
  if (calibration) await writeJson(resolve(bundle, "calibration.json"), calibration);
  if (review) await writeJson(resolve(bundle, "review.json"), review);
  if (rawMusic) {
    await copyFile(resolve(directory, "music.raw.json"), resolve(bundle, "music.raw.json"));
    await writeJson(resolve(bundle, "notes.json"), {
      schemaVersion: 1,
      sourceSha256: source.video.sha256,
      backend: rawMusic.backend,
      notes,
      midiOffsetPolicy:
        "keyRelease if reviewed, otherwise model estimatedOffset; never observed by default"
    });
    await writeFile(resolve(bundle, "notes.mid"), notesMidi(notes), { flag: "wx" });
  }
  for (const file of ["hands.raw.jsonl", "hands.summary.json"])
    if (handsReceipt) await copyFile(resolve(directory, file), resolve(bundle, file));
  if (handsReceipt && (await exists(resolve(directory, "overlays")))) {
    await safeDirectory(root, resolve(directory, "overlays"));
    await safeDirectory(root, resolve(bundle, "overlays"));
    for (const entry of await readdir(resolve(directory, "overlays"), { withFileTypes: true })) {
      if (!entry.isFile() || !/^\d+\.png$/.test(entry.name))
        throw new Error("Неожиданный файл в overlays.");
      const path = resolve(directory, "overlays", entry.name);
      await assertNoLink(path);
      await copyFile(path, resolve(bundle, "overlays", entry.name));
    }
  }
  const controls = await evidence(
    root,
    bundle,
    source,
    resolve(directory, source.video.file),
    notes,
    [
      ...(review?.notes.flatMap((patch) => patch.evidence) ?? []),
      ...(review?.hands.reviewedRanges.flatMap((range) => range.evidence) ?? [])
    ]
  );
  const allowedEvidence = new Set(controls.map((control) => control.id));
  for (const patch of review?.notes ?? [])
    for (const reference of patch.evidence)
      if (!allowedEvidence.has(reference))
        throw new Error(
          `Evidence не найден: ${reference}; используйте frame-<frameIndex> из index.json.`
        );
  for (const range of review?.hands.reviewedRanges ?? [])
    for (const reference of range.evidence)
      if (!allowedEvidence.has(reference))
        throw new Error(`Evidence диапазона не найден: ${reference}`);
  await writeFile(resolve(bundle, "HANDOFF.md"), HANDOFF, { flag: "wx" });
  const files: Record<string, string> = {};
  for (const file of await collectFiles(bundle)) {
    await assertNoLink(resolve(bundle, file));
    files[file] = await digest(resolve(bundle, file));
  }
  for (const receipt of [musicReceipt, handsReceipt])
    if (receipt)
      for (const [file, expected] of Object.entries(receipt.files))
        if (files[file] !== expected) throw new Error(`Изменён raw при экспорте: ${file}`);
  await readCapture(root, options.id);
  const first = frames[0]?.time ?? source.timelineOriginSeconds;
  const last = frames.at(-1)?.time ?? source.timelineEndSeconds;
  const status = reviewStatus(notes, review, first, last);
  await writeJson(resolve(bundle, "manifest.json"), {
    schemaVersion: 1,
    sourceSha256: source.video.sha256,
    status: { ...status, hands: frames.length ? status.hands : "missing" },
    coverage: {
      start: first,
      end: last,
      totalSourceFrames: source.frames.length,
      observedFrames: frames.length,
      framesWithHands: frames.filter((frame) => frame.hands.length).length,
      framesWithDiagnostics: frames.filter((frame) => frame.diagnostics.length).length
    },
    stages: { music: musicReceipt, hands: handsReceipt },
    files
  });
  console.log(`Пакет для Claude: ${bundle}`);
}
