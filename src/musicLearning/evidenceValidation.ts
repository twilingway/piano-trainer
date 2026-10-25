import type { DictationResult } from "./dictationSession";
import type { MusicResult } from "./progress";
import { compareDictation } from "./dictation";
import type { DictationExercise } from "./dictation";
import { musicFingerprint, normalizeMusicNotes } from "./material";
import { validMusicInputEntry, MUSIC_INPUT_EVIDENCE_LIMIT } from "./evidence";
import type { EmbeddedMusicEvidence, MusicInputEvidence, MusicInputJournalData } from "./evidence";
import type { MusicNote } from "./types";
import {
  finite,
  integer,
  oneOf,
  plainMusicJson,
  record,
  text,
  validMusicHelp,
  validNotes,
  validHarmony,
  validDictation
} from "./progressValidation";

export interface MusicJournalIdentity {
  readonly runId?: string;
  readonly presentationId?: string;
  readonly inputSource?: "midi" | "keyboard" | "pointer";
}
/** Reject gaps and duplicate IDs; raw MIDI delivery may be reordered, received timestamps may not. */
export function validateMusicInputJournal(
  value: unknown,
  expected: MusicJournalIdentity = {}
): value is MusicInputJournalData {
  if (
    !plainMusicJson(value) ||
    !record(value) ||
    value.schemaVersion !== 1 ||
    !text(value.runId) ||
    !text(value.presentationId) ||
    value.valid !== true ||
    value.droppedEvents !== 0 ||
    !finite(value.presentedAtMs) ||
    !oneOf(value.presentationKind, ["staff", "audio", "ready"]) ||
    !Array.isArray(value.events) ||
    value.events.length > MUSIC_INPUT_EVIDENCE_LIMIT ||
    (expected.runId !== undefined && value.runId !== expected.runId) ||
    (expected.presentationId !== undefined && value.presentationId !== expected.presentationId) ||
    Object.keys(value).some(
      (key) =>
        ![
          "schemaVersion",
          "runId",
          "presentationId",
          "presentedAtMs",
          "presentationKind",
          "valid",
          "droppedEvents",
          "events"
        ].includes(key)
    )
  )
    return false;
  let received = 0;
  const ids = new Set<string>();
  return value.events.every((entry, index) => {
    if (
      !record(entry) ||
      !text(entry.id, 1024) ||
      ids.has(entry.id) ||
      entry.id !== `${value.runId as string}:input:${String(index + 1)}` ||
      entry.runId !== value.runId ||
      entry.presentationId !== value.presentationId ||
      !validMusicInputEntry(entry as unknown as MusicInputEvidence) ||
      (expected.inputSource !== undefined &&
        entry.eligible === true &&
        entry.kind !== "choice" &&
        entry.source !== expected.inputSource) ||
      !finite(entry.receivedAtMs) ||
      entry.receivedAtMs < received ||
      (entry.eligible === true &&
        (!finite(entry.rawAtMs) || entry.rawAtMs < (value.presentedAtMs as number)))
    )
      return false;
    if (
      Object.keys(entry).some(
        (key) =>
          ![
            "id",
            "runId",
            "presentationId",
            "source",
            "deviceId",
            "channel",
            "rawAtMs",
            "correctedAtMs",
            "receivedAtMs",
            "songBeat",
            "eligible",
            "hand",
            ...(entry.kind === "choice" ? ["kind", "value"] : ["kind", "pitch"])
          ].includes(key)
      )
    )
      return false;
    received = entry.receivedAtMs;
    ids.add(entry.id);
    return true;
  });
}
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-8;
const owner = (event: MusicInputEvidence): string =>
  JSON.stringify([event.source, event.deviceId ?? "", event.channel ?? null]);
/** Every saved performance note must be supported by its own eligible physical down and release. */
export function musicNotesHaveJournal(
  notes: readonly MusicNote[],
  journal: MusicInputJournalData
): boolean {
  const claimed = new Set<string>();
  return notes.every((note) => {
    for (const down of journal.events) {
      if (
        down.kind !== "down" ||
        !down.eligible ||
        claimed.has(down.id) ||
        down.pitch !== note.pitch ||
        down.songBeat === null ||
        !near(down.songBeat, note.startBeat) ||
        (down.hand !== undefined && down.hand !== note.hand)
      )
        continue;
      const up = journal.events.find(
        (event) =>
          event.kind === "up" &&
          event.eligible &&
          !claimed.has(event.id) &&
          event.pitch === note.pitch &&
          owner(event) === owner(down) &&
          event.correctedAtMs >= down.correctedAtMs &&
          event.songBeat !== null &&
          near(event.songBeat, note.startBeat + note.durationBeats)
      );
      if (!up) continue;
      claimed.add(down.id);
      claimed.add(up.id);
      return true;
    }
    return false;
  });
}
export function musicAnswersHaveJournal(
  answers: EmbeddedMusicEvidence["answers"],
  journal: MusicInputJournalData
): boolean {
  const choices = new Set<string>();
  return answers.every((answer) => {
    if (answer.kind === "named") {
      const event = journal.events.find(
        (entry) =>
          entry.kind === "choice" &&
          entry.eligible &&
          entry.value === answer.answer &&
          !choices.has(entry.id)
      );
      if (!event) return false;
      choices.add(event.id);
      return true;
    }
    return answer.playedPitches.every((pitch) =>
      journal.events.some(
        (entry) => entry.kind === "down" && entry.pitch === pitch && entry.eligible
      )
    );
  });
}
export function validateEvidenceListening(value: unknown, journal: MusicInputJournalData): boolean {
  if (
    !record(value) ||
    value.attemptId !== journal.runId ||
    value.presentationId !== journal.presentationId ||
    !oneOf(value.purpose, ["training", "control"]) ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > 256
  )
    return false;
  let boundary = 0,
    started = 0;
  const ids = new Set<string>();
  const valid = value.receipts.every((receipt) => {
    if (
      !record(receipt) ||
      !text(receipt.playbackId) ||
      ids.has(receipt.playbackId) ||
      !finite(receipt.requestedAtMs, boundary) ||
      !finite(receipt.endedAtMs, receipt.requestedAtMs)
    )
      return false;
    if (receipt.outcome === "failed-before-start") {
      if (receipt.startedAtMs !== null) return false;
    } else if (
      !oneOf(receipt.outcome, ["full", "partial"]) ||
      !finite(receipt.startedAtMs, receipt.requestedAtMs, receipt.endedAtMs)
    )
      return false;
    else started++;
    ids.add(receipt.playbackId);
    boundary = receipt.endedAtMs;
    return true;
  });
  return valid && (value.purpose !== "control" || started <= 2);
}
/** Audio receipts use raw performance time; captured note timestamps are latency-corrected. */
export function dictationFollowsRawListening(
  result: DictationResult,
  journal: MusicInputJournalData
): boolean {
  return result.notes.every((note) =>
    journal.events.some((down) => {
      if (
        down.kind !== "down" ||
        !down.eligible ||
        down.pitch !== note.pitch ||
        down.correctedAtMs !== note.downAtMs ||
        down.source !== note.origin.source ||
        down.deviceId !== note.origin.deviceId ||
        down.channel !== note.origin.channel ||
        down.songBeat === null ||
        !near(down.songBeat, note.startBeat)
      )
        return false;
      return journal.events.some((up) => {
        if (
          up.kind !== "up" ||
          !up.eligible ||
          up.pitch !== note.pitch ||
          up.correctedAtMs !== note.upAtMs ||
          owner(up) !== owner(down) ||
          up.songBeat === null ||
          !near(up.songBeat, note.startBeat + note.durationBeats) ||
          up.rawAtMs < down.rawAtMs
        )
          return false;
        return (
          result.listening.receipts.some(
            (receipt) =>
              receipt.outcome === "full" &&
              receipt.endedAtMs !== null &&
              receipt.endedAtMs <= down.rawAtMs
          ) &&
          result.listening.receipts.every(
            (receipt) =>
              receipt.endedAtMs !== null &&
              (up.rawAtMs <= receipt.requestedAtMs || down.rawAtMs >= receipt.endedAtMs)
          )
        );
      });
    })
  );
}
/** A complete child body, without a second Song/XML or a second progress-store entry. */
export function validateMusicEvidence(
  value: unknown,
  expected: MusicJournalIdentity = {}
): value is EmbeddedMusicEvidence {
  if (
    !plainMusicJson(value) ||
    !record(value) ||
    value.schemaVersion !== 1 ||
    !finite(value.startedAt) ||
    !finite(value.completedAt) ||
    value.completedAt < value.startedAt ||
    !record(value.material) ||
    !validateMusicInputJournal(value.inputJournal, expected) ||
    !validNotes(value.notes, false) ||
    !Array.isArray(value.answers) ||
    value.answers.length > 128 ||
    !validMusicHelp(value.help) ||
    !validateEvidenceListening(value.listening, value.inputJournal) ||
    Object.keys(value).some(
      (key) =>
        ![
          "schemaVersion",
          "startedAt",
          "completedAt",
          "material",
          "inputJournal",
          "notes",
          "answers",
          "dictation",
          "listening",
          "help"
        ].includes(key)
    )
  )
    return false;
  const material = value.material;
  if (
    !text(material.id) ||
    !integer(material.seed, 0, 0xffffffff) ||
    material.generatorVersion !== 1 ||
    !finite(material.bpm, 30, 240) ||
    !text(material.fingerprint, 16384) ||
    !validNotes(material.notes, true) ||
    Object.keys(material).some(
      (key) => !["id", "seed", "generatorVersion", "bpm", "fingerprint", "notes"].includes(key)
    )
  )
    return false;
  try {
    if (musicFingerprint(material.notes) !== material.fingerprint) return false;
    normalizeMusicNotes(material.notes);
  } catch {
    return false;
  }
  const journal = value.inputJournal;
  const notes = value.notes;
  if (!musicNotesHaveJournal(value.notes, journal)) return false;
  if (
    value.answers.length > 0 &&
    !validHarmony({
      aural: false,
      lesson: "triads",
      mode: "build-chord",
      expectedNotes: material.notes,
      answers: value.answers
    })
  )
    return false;
  if (!musicAnswersHaveJournal(value.answers as EmbeddedMusicEvidence["answers"], journal))
    return false;
  if (value.dictation !== null) {
    if (
      !record(value.dictation) ||
      !validDictation({
        runId: journal.runId,
        exerciseId: material.id,
        purpose: (value.listening as Record<string, unknown>).purpose,
        inputSource:
          expected.inputSource ??
          journal.events.find((entry) => entry.kind !== "choice")?.source ??
          "keyboard",
        help: value.help,
        expectedNotes: material.notes,
        startMode: "known",
        level: 1,
        result: value.dictation,
        inputJournal: journal
      }) ||
      JSON.stringify(value.dictation.listening) !== JSON.stringify(value.listening)
    )
      return false;
    const dictation = value.dictation as unknown as NonNullable<EmbeddedMusicEvidence["dictation"]>;
    if (
      JSON.stringify(dictation.comparison) !==
      JSON.stringify(
        compareDictation(
          { notes: material.notes, startMode: "known" } as DictationExercise,
          dictation.notes
        )
      )
    )
      return false;
    if (
      !Array.isArray(value.dictation.notes) ||
      value.dictation.notes.length !== value.notes.length ||
      !value.dictation.notes.every(
        (note, index) =>
          record(note) &&
          note.pitch === notes[index]?.pitch &&
          note.startBeat === notes[index]?.startBeat &&
          note.durationBeats === notes[index]?.durationBeats
      )
    )
      return false;
  }
  return true;
}

/** Native course results carry real event identities; legacy summaries make no new provenance claim. */
export function validateNativeMusicResult(row: MusicResult): boolean {
  if (row.provenance === undefined || row.provenance === "legacy")
    return (
      row.inputJournal === undefined ||
      validateMusicInputJournal(row.inputJournal, {
        runId: row.runId,
        inputSource: row.inputSource
      })
    );
  if (row.id !== row.runId) return false;
  if (row.course === "integrated")
    return (
      row.inputJournal === undefined &&
      row.state.results.every(
        (child) =>
          child.evidence !== undefined &&
          child.resultId === child.runId &&
          validateMusicEvidence(child.evidence, {
            runId: child.runId,
            presentationId: child.presentationId,
            inputSource: child.source
          })
      )
    );
  if (
    !validateMusicInputJournal(row.inputJournal, { runId: row.runId, inputSource: row.inputSource })
  )
    return false;
  const journal = row.inputJournal;
  if (row.course === "sight-reading")
    return (
      musicNotesHaveJournal(row.playedNotes, journal) &&
      musicAnswersHaveJournal(
        row.groupAnswers.map((group) => ({
          kind: "named",
          expected: group.expected,
          answer: group.answer
        })),
        journal
      )
    );
  if (row.course === "harmony") {
    const physical = row.answers.some((answer) => answer.kind === "played");
    if (
      !physical &&
      !journal.events.some(
        (event) => event.kind === "choice" && event.eligible && event.source === row.inputSource
      )
    )
      return false;
    return musicAnswersHaveJournal(row.answers, journal);
  }
  return (
    journal.presentationId === row.result.presentationId &&
    musicNotesHaveJournal(
      row.result.notes.map((note) => ({
        pitch: note.pitch,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        hand: "right"
      })),
      journal
    ) &&
    row.result.notes.every(
      (note) =>
        journal.events.some(
          (event) =>
            event.kind === "down" &&
            event.eligible &&
            event.pitch === note.pitch &&
            event.correctedAtMs === note.downAtMs &&
            event.source === note.origin.source &&
            event.deviceId === note.origin.deviceId &&
            event.channel === note.origin.channel
        ) &&
        journal.events.some(
          (event) =>
            event.kind === "up" &&
            event.eligible &&
            event.pitch === note.pitch &&
            event.correctedAtMs === note.upAtMs &&
            event.source === note.origin.source &&
            event.deviceId === note.origin.deviceId &&
            event.channel === note.origin.channel
        )
    )
  );
}
