import { copyMusicResult } from "../musicLearning/progress";
import { addReadingResult } from "../reading/progress";
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  musicResultFixture,
  harmonyAccompanimentResultFixture
} from "../musicLearning/progressFixture";
import { createIntegratedPlan, IntegratedLesson } from "../musicLearning/integrated";
import { createMemoryReadingRepository } from "./readingRepository";
import { createAppStore } from "./store";
import { readingActions } from "./readingSlice";
import {
  changedReadingFields,
  emptyReadingState,
  mergeReadingState,
  normalizeReadingState
} from "./readingMigration";
import { emptyMusicState, MUSIC_PREFERENCE_FIELDS, normalizeMusicState } from "./musicPersistence";
import { readingResult } from "./readingMigration.test";

const storage = () => ({ getItem: () => null, setItem: vi.fn() });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
describe("one music slot in the reading repository", () => {
  it.each([
    [60, "major", "white"],
    [61, "major", "all"],
    [60, "minor", "all"]
  ] as const)(
    "migrates absent tone preference without replacing root %s or quality %s",
    (harmonyRoot, harmonyQuality, harmonyTonePitchSet) => {
      const { harmonyTonePitchSet: _new, ...legacy } = emptyMusicState();
      const previous = musicResultFixture("harmony");
      const history = [{ ...previous, lesson: "tone-semitone" }];
      const normalized = normalizeMusicState({ ...legacy, harmonyRoot, harmonyQuality, history });
      expect(normalized.invalid).toBe(false);
      expect(normalized.music).toMatchObject({
        harmonyRoot,
        harmonyQuality,
        harmonyTonePitchSet,
        generatorVersion: 1
      });
      expect(normalized.music.history).toEqual(history);
      expect(normalized.music.history[0]).not.toHaveProperty("toneRecipe");
      expect(normalizeMusicState(normalized.music).music).toEqual(normalized.music);
    }
  );
  it("persists the tone preference independently without changing selection, custom roots or history", async () => {
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    const revision = store.getState().reading.selectionRevision;
    store.dispatch(
      readingActions.musicPreferencesChanged({
        harmonyRoot: 61,
        harmonyQuality: "minor",
        harmonyTonePitchSet: "all"
      })
    );
    store.dispatch(readingActions.musicPreferencesChanged({ harmonyTonePitchSet: "white" }));
    await store.flushReadingPersistence();
    expect(store.getState().reading.selectionRevision).toBe(revision);
    const reloaded = createAppStore({ storage: storage(), readingRepository: repository });
    await reloaded.readingPersistenceReady;
    expect(reloaded.getState().reading.music).toMatchObject({
      harmonyRoot: 61,
      harmonyQuality: "minor",
      harmonyTonePitchSet: "white"
    });
  });
  it("migrates schema8 to9 without dropping earlier courses, journal, profile or preferences", () => {
    const previous = emptyReadingState();
    previous.activeCourse = "note-reading";
    previous.task = "notes";
    previous.seed = 7;
    const oldResult = readingResult("old");
    previous.history = [oldResult];
    previous.profile = addReadingResult(previous.profile, oldResult);
    previous.presentedFingerprints = ["shown"];
    previous.preferences = { automaticHints: false, nameDelayMs: 15000, keyDelayMs: 18000 };
    const { music: _new, ...old } = previous;
    const first = normalizeReadingState({ ...old, schemaVersion: 8 });
    expect(first.blocked).toBe(false);
    expect(first.invalid).toBe(false);
    expect(first.reading).toMatchObject({
      ...previous,
      schemaVersion: 9,
      music: emptyMusicState()
    });
    expect(normalizeReadingState(first.reading).reading).toEqual(first.reading);
    expect(first.reading.music).toMatchObject({
      dictationLength: 2,
      harmonyLesson: "tone-semitone",
      sightPreviewSeconds: 10
    });
    expect(normalizeReadingState({ schemaVersion: 10, marker: "future" }).blocked).toBe(true);
  });
  it("drops a corrupt P7 entry alone and keeps correct P5/P6/P8 plus earlier history", () => {
    const state = emptyReadingState();
    const valid = ["sight-reading", "harmony", "integrated"].map((course) =>
      musicResultFixture(course as "sight-reading" | "harmony" | "integrated")
    );
    const corrupt = { ...musicResultFixture("dictation"), generatorVersion: 99 };
    const reading = normalizeReadingState({
      ...state,
      history: [readingResult("old")],
      music: { ...state.music, history: [...valid, corrupt] }
    });
    expect(reading.invalid).toBe(true);
    expect(reading.reading.history).toHaveLength(1);
    expect(reading.reading.music.history.map((r) => r.course)).toEqual([
      "sight-reading",
      "harmony",
      "integrated"
    ]);
  });
  it("tracks every preference independently and groups only course/seed/purpose with the revision", () => {
    const initial = emptyReadingState();
    const current = {
      ...initial,
      music: { ...initial.music, sightPreviewSeconds: 15, dictationLength: 8, harmonyAural: true }
    };
    expect(changedReadingFields(current, initial)).toEqual([
      "musicSightPreviewSeconds",
      "musicHarmonyAural",
      "musicDictationLength"
    ]);
    const selected = {
      ...initial,
      activeCourse: "music-learning" as const,
      selectionRevision: 1,
      music: {
        ...initial.music,
        course: "dictation" as const,
        seed: 22,
        purpose: "control" as const
      }
    };
    expect(changedReadingFields(selected, initial)).toContain("musicSelection");
    expect(changedReadingFields(selected, initial)).toContain("activeCourse");
    expect(new Set(MUSIC_PREFERENCE_FIELDS.map((f) => f.field)).size).toBe(
      MUSIC_PREFERENCE_FIELDS.length
    );
  });
  it("merges stale tabs by changed fields while preserving committed history against edits", () => {
    const saved = emptyReadingState();
    saved.music.sightPreviewSeconds = 15;
    const committed = musicResultFixture("sight-reading");
    saved.music.history = [copyMusicResult(committed)];
    const incoming = emptyReadingState();
    incoming.music.dictationLength = 8;
    incoming.music.history = [copyMusicResult({ ...committed, newMaterial: true })];
    const merged = mergeReadingState(saved, incoming, ["musicDictationLength"]);
    expect(merged.music.sightPreviewSeconds).toBe(15);
    expect(merged.music.dictationLength).toBe(8);
    expect(merged.music.history).toEqual(saved.music.history);
  });
  it("rejects malformed preferences individually without losing valid settings or history", () => {
    const base = emptyMusicState();
    const normalized = normalizeMusicState({
      ...base,
      sightPreviewSeconds: 4,
      dictationLength: 9,
      harmonyRoot: 99,
      harmonyInversion: 3,
      harmonyQuality: "future",
      harmonyProgression: "future",
      history: [musicResultFixture("sight-reading")]
    });
    expect(normalized.invalid).toBe(true);
    expect(normalized.music.history).toHaveLength(1);
    expect(normalized.music).toMatchObject({
      sightPreviewSeconds: 10,
      dictationLength: 2,
      harmonyRoot: 60,
      harmonyInversion: 0,
      harmonyQuality: "major",
      harmonyProgression: "I-IV-V-I"
    });
  });
  it("persists new selection/preferences/results through the existing repository and reloads without active answers", async () => {
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(
      readingActions.musicSelected({ course: "sight-reading", seed: 42, purpose: "control" })
    );
    store.dispatch(
      readingActions.musicPreferencesChanged({
        sightPreviewSeconds: 15,
        harmonyQuality: "minor",
        harmonyRoot: 65,
        harmonyInversion: 1,
        harmonyAural: true,
        harmonyProgression: "I-V-vi-IV"
      })
    );
    store.dispatch(readingActions.musicResultAdded(musicResultFixture("sight-reading")));
    store.dispatch(readingActions.musicResultAdded(musicResultFixture("sight-reading")));
    await store.flushReadingPersistence();
    const restored = createAppStore({ storage: storage(), readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading.activeCourse).toBe("music-learning");
    expect(restored.getState().reading.music).toMatchObject({
      course: "sight-reading",
      seed: 42,
      purpose: "control",
      sightPreviewSeconds: 15,
      harmonyQuality: "minor",
      harmonyRoot: 65,
      harmonyInversion: 1,
      harmonyAural: true,
      harmonyProgression: "I-V-vi-IV"
    });
    expect(restored.getState().reading.music.history).toHaveLength(1);
    expect(restored.getState().reading.music).not.toHaveProperty("activeAnswers");
    expect(restored.getState().reading.selectionRevision).toBe(0);
  });
  it("applies material preferences to the next exercise while only source changes invalidate the active run", async () => {
    const store = createAppStore({
      storage: storage(),
      readingRepository: createMemoryReadingRepository()
    });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.musicSelected({ course: "dictation", seed: 42 }));
    const revision = store.getState().reading.selectionRevision;
    store.dispatch(
      readingActions.musicPreferencesChanged({
        sightPreviewSeconds: 15,
        sightLevel: "two-hands",
        harmonyRoot: 65,
        harmonyQuality: "minor",
        dictationLength: 8,
        dictationStartMode: "relative"
      })
    );
    expect(store.getState().reading.selectionRevision).toBe(revision);
    store.dispatch(readingActions.musicPreferencesChanged({ inputSource: "pointer" }));
    expect(store.getState().reading.selectionRevision).toBe(revision + 1);
    store.dispatch(readingActions.musicSelected({ course: "dictation", seed: 42 }));
    expect(store.getState().reading.selectionRevision).toBe(revision + 2);
  });
  it("persists the actually reserved seed without creating a new run and ignores stale preparation", async () => {
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.musicSelected({ course: "sight-reading", seed: 42 }));
    const selectionRevision = store.getState().reading.selectionRevision;
    store.dispatch(readingActions.musicMaterialPrepared({ seed: 43, selectionRevision }));
    expect(store.getState().reading.music.seed).toBe(43);
    expect(store.getState().reading.selectionRevision).toBe(selectionRevision);
    await store.flushReadingPersistence();
    expect(normalizeReadingState(await repository.load()).reading.music.seed).toBe(43);
    store.dispatch(
      readingActions.musicMaterialPrepared({ seed: 44, selectionRevision: selectionRevision - 1 })
    );
    store.dispatch(readingActions.musicMaterialPrepared({ seed: NaN, selectionRevision }));
    expect(store.getState().reading.music.seed).toBe(43);
    store.dispatch(readingActions.exit());
    store.dispatch(
      readingActions.musicMaterialPrepared({
        seed: 45,
        selectionRevision: store.getState().reading.selectionRevision
      })
    );
    expect(store.getState().reading.music.seed).toBe(43);
  });
  it("keeps different preferences from concurrent tabs without replacing the whole music slot", async () => {
    const repository = createMemoryReadingRepository(emptyReadingState());
    const first = createAppStore({ storage: storage(), readingRepository: repository });
    const second = createAppStore({ storage: storage(), readingRepository: repository });
    await Promise.all([first.readingPersistenceReady, second.readingPersistenceReady]);
    first.dispatch(
      readingActions.musicPreferencesChanged({ sightPreviewSeconds: 15, harmonyAural: true })
    );
    second.dispatch(
      readingActions.musicPreferencesChanged({ dictationLength: 8, harmonyQuality: "minor" })
    );
    await Promise.all([first.flushReadingPersistence(), second.flushReadingPersistence()]);
    expect(normalizeReadingState(await repository.load()).reading.music).toMatchObject({
      sightPreviewSeconds: 15,
      dictationLength: 8,
      harmonyAural: true,
      harmonyQuality: "minor"
    });
  });
  it("honors explicit preferences equal to the baseline before late hydration and excludes legacy music results", async () => {
    const saved = emptyReadingState();
    saved.music.sightPreviewSeconds = 15;
    saved.music.dictationLength = 8;
    saved.music.history = [musicResultFixture("harmony") as (typeof saved.music.history)[number]];
    const loaded = deferred<unknown>();
    const backing = createMemoryReadingRepository(saved);
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...backing, load: () => loaded.promise }
    });
    store.dispatch(readingActions.musicPreferencesChanged({ sightPreviewSeconds: 10 }));
    store.dispatch(readingActions.musicResultAdded(musicResultFixture("sight-reading")));
    loaded.resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    const state = normalizeReadingState(await backing.load()).reading;
    expect(state.music).toMatchObject({ sightPreviewSeconds: 10, dictationLength: 8 });
    expect(state.music.history.map((r) => r.course)).toEqual(["sight-reading", "harmony"]);
  });
  it("keeps P8 plan/ref boundaries separately from other course preferences and recreates generation", async () => {
    const repository = createMemoryReadingRepository(emptyReadingState());
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    const plan = createIntegratedPlan({ seed: 42 });
    const lesson = new IntegratedLesson({ plan, lessonId: "resume" });
    const progress = {
      plan: { seed: 42, version: 1 as const, theme: "c-major" as const, bpm: plan.bpm },
      state: lesson.save()
    };
    store.dispatch(
      readingActions.musicPreferencesChanged({ dictationLength: 8, sightPreviewSeconds: 12 })
    );
    store.dispatch(readingActions.musicIntegratedChanged(progress));
    await store.flushReadingPersistence();
    const saved = normalizeReadingState(await repository.load()).reading.music;
    expect(saved.integrated).toEqual(progress);
    expect(saved).toMatchObject({ dictationLength: 8, sightPreviewSeconds: 12 });
    if (!saved.integrated) throw new Error("Missing integrated persistence fixture");
    const restored = new IntegratedLesson({
      plan,
      lessonId: "resume",
      saved: saved.integrated.state
    });
    expect(restored.snapshot().identity.generation).toBe(lesson.snapshot().identity.generation + 1);
    expect(restored.snapshot().ready).toBe(false);
  });
  it("leaves future schema10 unchanged when a new preference is dispatched", async () => {
    const future = { schemaVersion: 10, marker: "untouched" };
    const repository = createMemoryReadingRepository(future);
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    store.dispatch(readingActions.musicPreferencesChanged({ dictationLength: 8 }));
    await store.flushReadingPersistence();
    expect(await repository.load()).toEqual(future);
    expect(store.getState().persistence.errors["indexedDB:reading:read"]).toBe("invalid");
  });
});

describe("music recovery and next-run preferences", () => {
  it("repairs one bad music-history row and keeps actual new results, preferences and journal claims writable", async () => {
    const saved = emptyReadingState();
    const old = musicResultFixture("sight-reading", "old"),
      bad = { ...musicResultFixture("dictation", "bad"), generatorVersion: 99 };
    const raw = { ...saved, music: { ...saved.music, history: [old, bad] } };
    expect(normalizeReadingState(raw)).toMatchObject({
      invalid: true,
      blocked: false,
      repairable: true
    });
    const repository = createMemoryReadingRepository(raw);
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    expect(await store.knownReadingFingerprints()).toEqual([]);
    store.dispatch(readingActions.musicResultAdded(musicResultFixture("sight-reading", "fresh")));
    store.dispatch(readingActions.musicPreferencesChanged({ dictationLength: 8 }));
    expect(await store.claimReadingMaterial("fresh-musical-fingerprint")).toBe(true);
    await store.flushReadingPersistence();
    const persisted = normalizeReadingState(await repository.load());
    expect(persisted).toMatchObject({ invalid: false, blocked: false, repairable: false });
    expect(persisted.reading.music.history.map((result) => result.runId)).toEqual(["fresh", "old"]);
    expect(persisted.reading.music.dictationLength).toBe(8);
    expect(await store.knownReadingFingerprints()).toContain("fresh-musical-fingerprint");
    const restored = createAppStore({ storage: storage(), readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading.music.history).toHaveLength(2);
  });
  it("keeps unsupported slot versions and unrelated corruption readonly", () => {
    const saved = emptyReadingState();
    const bad = { ...musicResultFixture("dictation"), generatorVersion: 99 };
    expect(
      normalizeReadingState({
        ...saved,
        music: { ...saved.music, generatorVersion: 99, history: [bad] }
      }).repairable
    ).toBe(false);
    expect(
      normalizeReadingState({
        ...saved,
        independentRhythm: undefined,
        music: { ...saved.music, history: [bad] }
      }).repairable
    ).toBe(false);
  });
  it("changes purpose as a separate next-run preference and honors explicit baseline selections before hydration", async () => {
    const saved = emptyReadingState();
    saved.music.purpose = "control";
    const loaded = deferred<unknown>();
    const repository = createMemoryReadingRepository(saved);
    const store = createAppStore({
      storage: storage(),
      readingRepository: { ...repository, load: () => loaded.promise }
    });
    store.dispatch(
      readingActions.musicSelected({ course: "sight-reading", seed: 42, purpose: "training" })
    );
    const revision = store.getState().reading.selectionRevision;
    store.dispatch(readingActions.musicPreferencesChanged({ purpose: "training" }));
    loaded.resolve(saved);
    await store.readingPersistenceReady;
    await store.flushReadingPersistence();
    expect(store.getState().reading.music.purpose).toBe("training");
    store.dispatch(readingActions.musicPreferencesChanged({ purpose: "control" }));
    expect(store.getState().reading.selectionRevision).toBe(revision);
    await store.flushReadingPersistence();
    expect(normalizeReadingState(await repository.load()).reading.music.purpose).toBe("control");
    const old = emptyReadingState();
    const changed = { ...old, music: { ...old.music, purpose: "control" as const } };
    expect(changedReadingFields(changed, old)).toEqual(["musicPurpose"]);
  });
  it("round-trips a real accompaniment through the shared repository", async () => {
    const repository = createMemoryReadingRepository();
    const store = createAppStore({ storage: storage(), readingRepository: repository });
    await store.readingPersistenceReady;
    const result = harmonyAccompanimentResultFixture("persist-accomp");
    store.dispatch(readingActions.musicResultAdded(result));
    await store.flushReadingPersistence();
    const restored = createAppStore({ storage: storage(), readingRepository: repository });
    await restored.readingPersistenceReady;
    expect(restored.getState().reading.music.history).toContainEqual(result);
  });
});
