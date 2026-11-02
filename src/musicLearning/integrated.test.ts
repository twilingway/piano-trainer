// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  createIntegratedPlan,
  IntegratedLesson,
  integratedObservations,
  recommendIntegratedPhase
} from "./integrated";
import type {
  IntegratedChildResult,
  IntegratedEvidence,
  IntegratedObservation,
  IntegratedPhaseId,
  IntegratedSnapshot
} from "./integrated";
import { INTEGRATED_PHASE_IDS } from "./integratedPlan";

const plan = createIntegratedPlan({ seed: 327, bpm: 80 });
const evidence: Record<IntegratedEvidence["skill"], IntegratedEvidence> = {
  keyboard: { skill: "keyboard", errors: { wrongKeys: 0 } },
  reading: { skill: "reading", errors: { pitches: 0, timing: 0, groups: 0 } },
  rhythm: { skill: "rhythm", errors: { onsets: 0, durations: 0, missing: 0, extra: 0 } },
  interval: { skill: "interval", errors: { recognition: 0, pitches: 0 } },
  harmony: { skill: "harmony", errors: { pitches: 0, bass: 0, synchrony: 0 } },
  coordination: { skill: "coordination", errors: { left: 0, right: 0, timing: 0 } }
};
function result(snapshot: IntegratedSnapshot): IntegratedChildResult {
  return {
    ...snapshot.identity,
    ...evidence[snapshot.activity.skill],
    resultId: `result:${snapshot.identity.runId}`,
    purpose: snapshot.purpose,
    source: "keyboard",
    status: "completed",
    performedUnits: snapshot.activity.expectedUnits,
    help: [],
    visualAlternative: snapshot.visualAlternative,
    auditoryVerified: snapshot.activity.auditory && !snapshot.visualAlternative
  };
}
function start(lesson: IntegratedLesson): IntegratedSnapshot {
  const snapshot = lesson.snapshot();
  expect(
    lesson.setReady(snapshot.identity, {
      reservedFingerprint: snapshot.activity.exercise.fingerprint
    })
  ).toBe(true);
  expect(lesson.start(snapshot.identity)).toBe(true);
  return lesson.snapshot();
}
function complete(lesson: IntegratedLesson): void {
  expect(lesson.complete(result(start(lesson)))).toBe(true);
}
function reach(lesson: IntegratedLesson, phase: IntegratedPhaseId): void {
  for (let count = 0; lesson.snapshot().phaseId !== phase && count < 20; count++) {
    complete(lesson);
    expect(lesson.next(lesson.snapshot().identity)).toBe(true);
  }
  expect(lesson.snapshot().phaseId).toBe(phase);
}
function finish(lesson: IntegratedLesson, visual = false): void {
  for (let count = 0; lesson.snapshot().status !== "lesson-complete" && count < 20; count++) {
    if (visual && lesson.snapshot().activity.auditory)
      expect(lesson.useVisualAlternative(lesson.snapshot().identity)).toBe(true);
    complete(lesson);
    if (lesson.snapshot().status !== "lesson-complete")
      expect(lesson.next(lesson.snapshot().identity)).toBe(true);
  }
  expect(lesson.snapshot().status).toBe("lesson-complete");
}

describe("integrated executable material", () => {
  it("reproduces all notes, scores and child IDs from explicit seed/theme/version", () => {
    expect(createIntegratedPlan({ seed: 327, bpm: 80, theme: "c-major", version: 1 })).toEqual(
      plan
    );
    const activities = plan.phases.flatMap((phase) => phase.activities);
    expect(plan.phases.map((phase) => phase.id)).toEqual(INTEGRATED_PHASE_IDS);
    expect(activities).toHaveLength(16);
    expect(new Set(activities.map((activity) => activity.id)).size).toBe(16);
    for (const { exercise } of activities) {
      expect(exercise.notes.length).toBeGreaterThan(0);
      expect(exercise.song.notes.length).toBeGreaterThan(0);
      expect(exercise.musicXml).toContain("<score-partwise");
      expect(exercise.bpm).toBe(80);
    }
    expect(
      createIntegratedPlan({ seed: 328 }).phases[1]?.activities[0]?.exercise.fingerprint
    ).not.toBe(plan.phases[1]?.activities[0]?.exercise.fingerprint);
  });
  it("contains five keys, both anchored intervals, all three triads and real two-hand music", () => {
    expect(plan.phases[0]?.activities.map((a) => a.exercise.notes[0]?.pitch)).toEqual([
      60, 62, 64, 65, 67
    ]);
    expect(
      plan.phases[3]?.activities.map((a) =>
        a.kind === "interval" ? [a.anchorPitch, a.semitones, a.intervalNumber] : []
      )
    ).toEqual([
      [60, 4, 3],
      [60, 7, 5]
    ]);
    expect(plan.phases[4]?.activities.map((a) => a.exercise.notes.map((n) => n.pitch))).toEqual([
      [60, 64, 67],
      [65, 69, 72],
      [67, 71, 74]
    ]);
    expect(new Set(plan.phases[2]?.activities[0]?.exercise.notes.map((n) => n.pitch)).size).toBe(1);
    expect(new Set(plan.phases[5]?.activities[0]?.exercise.notes.map((n) => n.hand))).toEqual(
      new Set(["left", "right"])
    );
  });
  it("requires novelty for unfamiliar reading and each distinct final combination", () => {
    expect(plan.phases[1]?.activities[0]?.noveltyRequired).toBe(true);
    const previous = new Set(
      plan.phases.slice(0, 6).flatMap((p) => p.activities.map((a) => a.exercise.fingerprint))
    );
    for (const activity of plan.phases[6]?.activities ?? []) {
      expect(activity.purpose).toBe("control");
      expect(activity.noveltyRequired).toBe(true);
      expect(previous.has(activity.exercise.fingerprint)).toBe(false);
    }
    expect(plan.phases[6]?.activities.map((a) => a.skill)).toEqual([
      "reading",
      "rhythm",
      "harmony"
    ]);
  });
  it("rejects unknown generator/theme versions and unsupported tempos", () => {
    expect(() => createIntegratedPlan({ seed: 1, version: 2 })).toThrow(RangeError);
    expect(() => createIntegratedPlan({ seed: 1, bpm: 0 })).toThrow(RangeError);
    expect(() => createIntegratedPlan({ seed: 1, theme: "other" as "c-major" })).toThrow(
      RangeError
    );
  });
});

describe("integrated phase orchestration", () => {
  it("manually runs all 16 children in seven phases and stores references once", () => {
    const lesson = new IntegratedLesson({ lessonId: "full", plan });
    finish(lesson);
    const snapshot = lesson.snapshot();
    expect(snapshot.completedPhases).toEqual(INTEGRATED_PHASE_IDS);
    expect(snapshot.results).toHaveLength(16);
    expect(snapshot.independentControl).toBe(true);
    expect(snapshot.auditoryVerified).toBe(true);
    expect(new Set(snapshot.results.map((r) => r.resultId)).size).toBe(16);
    expect(snapshot).not.toHaveProperty("accuracy");
    expect(lesson.next(snapshot.identity)).toBe(false);
  });
  it("cannot complete the two-interval or three-chord phase after its first child", () => {
    const lesson = new IntegratedLesson({ lessonId: "coverage", plan });
    reach(lesson, "heard-intervals");
    complete(lesson);
    expect(lesson.snapshot().status).toBe("child-complete");
    expect(lesson.snapshot().completedPhases).not.toContain("heard-intervals");
    expect(lesson.next(lesson.snapshot().identity)).toBe(true);
    complete(lesson);
    expect(lesson.snapshot().completedPhases).toContain("heard-intervals");
    expect(lesson.next(lesson.snapshot().identity)).toBe(true);
    for (let index = 0; index < 3; index++) {
      complete(lesson);
      expect(lesson.snapshot().completedPhases.includes("build-chords")).toBe(index === 2);
      if (index < 2) expect(lesson.next(lesson.snapshot().identity)).toBe(true);
    }
  });
  it("requires readiness and explicit start, rejects premature transitions and foreign callbacks", () => {
    const lesson = new IntegratedLesson({ lessonId: "guards", plan });
    const snapshot = lesson.snapshot();
    expect(lesson.start(snapshot.identity)).toBe(false);
    expect(lesson.complete(result(snapshot))).toBe(false);
    expect(lesson.next(snapshot.identity)).toBe(false);
    expect(lesson.repeat("final-control")).toBe(false);
    for (const changed of [
      { generation: 99 },
      { runId: "foreign" },
      { presentationId: "foreign" },
      { activityId: "foreign" }
    ]) {
      expect(lesson.setReady({ ...snapshot.identity, ...changed })).toBe(false);
    }
    expect(lesson.setReady(snapshot.identity)).toBe(true);
    expect(lesson.snapshot().status).toBe("preparation");
    expect(lesson.start({ ...snapshot.identity, runId: "foreign" })).toBe(false);
    expect(lesson.start(snapshot.identity)).toBe(true);
    expect(lesson.complete({ ...result(snapshot), presentationId: "foreign" })).toBe(false);
    expect(lesson.complete(result(snapshot))).toBe(true);
    expect(lesson.complete(result(snapshot))).toBe(false);
    expect(lesson.snapshot().results).toHaveLength(1);
    expect(lesson.next(snapshot.identity)).toBe(true);
    expect(lesson.snapshot().status).toBe("preparation");
    expect(lesson.snapshot().ready).toBe(false);
    expect(lesson.complete(result(snapshot))).toBe(false);
  });
  it("does not reveal/start novel music without the shared journal reservation", () => {
    const lesson = new IntegratedLesson({ lessonId: "novelty", plan });
    reach(lesson, "read-melody");
    const snapshot = lesson.snapshot();
    expect(lesson.setReady(snapshot.identity)).toBe(false);
    expect(lesson.setReady(snapshot.identity, { reservedFingerprint: "other" })).toBe(false);
    expect(lesson.start(snapshot.identity)).toBe(false);
    start(lesson);
  });
  it("rejects empty/partial, malformed and wrong-skill evidence or a reused child result ID", () => {
    const lesson = new IntegratedLesson({ lessonId: "evidence", plan });
    const snapshot = start(lesson);
    for (const change of [
      { status: "empty" as const },
      { performedUnits: 0 },
      { performedUnits: NaN },
      { errors: { wrongKeys: -1 } },
      { resultId: "" }
    ])
      expect(lesson.complete({ ...result(snapshot), ...change } as IntegratedChildResult)).toBe(
        false
      );
    expect(lesson.complete({ ...result(snapshot), ...evidence.interval })).toBe(false);
    completeExisting();
    function completeExisting() {
      expect(lesson.complete(result(snapshot))).toBe(true);
    }
    lesson.next(snapshot.identity);
    const next = start(lesson);
    expect(lesson.complete({ ...result(next), resultId: result(snapshot).resultId })).toBe(false);
  });
  it("preserves other completed phases during a selected-skill repeat and invalidates live callbacks", () => {
    const lesson = new IntegratedLesson({ lessonId: "repeat", plan });
    reach(lesson, "play-piece");
    const completed = lesson.snapshot().completedPhases;
    const old = start(lesson);
    expect(lesson.repeat("heard-intervals")).toBe(true);
    expect(lesson.snapshot().completedPhases).toEqual(completed);
    expect(lesson.complete(result(old))).toBe(false);
    expect(lesson.setReady(old.identity)).toBe(false);
    complete(lesson);
    lesson.next(lesson.snapshot().identity);
    complete(lesson);
    expect(lesson.next(lesson.snapshot().identity)).toBe(true);
    expect(lesson.snapshot().phaseId).toBe("play-piece");
    expect(lesson.snapshot().completedPhases).toEqual(completed);
  });
  it("reload keeps plan, selected skill and completed refs but requires new preparation and generation", () => {
    const lesson = new IntegratedLesson({ lessonId: "reload", plan });
    reach(lesson, "build-chords");
    complete(lesson);
    lesson.next(lesson.snapshot().identity);
    const old = start(lesson);
    const saved = lesson.save();
    const restored = new IntegratedLesson({ lessonId: "reload", plan, saved });
    const snapshot = restored.snapshot();
    expect(snapshot.phaseId).toBe("build-chords");
    expect(snapshot.activity.id).toBe(old.activity.id);
    expect(snapshot.identity.generation).toBe(old.identity.generation + 1);
    expect(snapshot.identity.presentationId).not.toBe(old.identity.presentationId);
    expect(snapshot.results).toEqual(saved.results);
    expect(snapshot.completedPhases).toEqual(saved.completedPhases);
    expect(snapshot.ready).toBe(false);
    expect(snapshot.status).toBe("preparation");
    expect(restored.start(snapshot.identity)).toBe(false);
    expect(restored.complete(result(old))).toBe(false);
    expect(() => new IntegratedLesson({ lessonId: "other", plan, saved })).toThrow(RangeError);
    expect(
      () =>
        new IntegratedLesson({
          lessonId: "reload",
          plan: createIntegratedPlan({ seed: 20 }),
          saved
        })
    ).toThrow(RangeError);
  });
  it("rebuilds novel material from a seed recipe before readiness and restores the identical score", () => {
    const lesson = new IntegratedLesson({ lessonId: "replacement", plan });
    reach(lesson, "read-melody");
    const old = lesson.snapshot();
    expect(lesson.replaceNovelActivity({ ...old.identity, runId: "foreign" }, 993)).toBe(false);
    expect(lesson.replaceNovelActivity(old.identity, 993)).toBe(true);
    const replacement = lesson.snapshot();
    expect(replacement.activity.id).toBe(old.activity.id);
    expect(replacement.activity.kind).toBe(old.activity.kind);
    expect(replacement.activity.exercise.fingerprint).not.toBe(old.activity.exercise.fingerprint);
    expect(replacement.identity.generation).toBeGreaterThan(old.identity.generation);
    expect(
      lesson.setReady(old.identity, { reservedFingerprint: old.activity.exercise.fingerprint })
    ).toBe(false);
    expect(
      lesson.setReady(replacement.identity, {
        reservedFingerprint: old.activity.exercise.fingerprint
      })
    ).toBe(false);
    const saved = lesson.save();
    expect(saved.activitySeeds).toEqual({ [replacement.activity.id]: 993 });
    expect(saved).not.toHaveProperty("song");
    const restored = new IntegratedLesson({ lessonId: "replacement", plan, saved });
    expect(restored.snapshot().activity.exercise).toEqual(replacement.activity.exercise);
    start(restored);
    expect(restored.replaceNovelActivity(restored.snapshot().identity, 994)).toBe(false);
    expect(
      lesson.setReady(replacement.identity, {
        reservedFingerprint: replacement.activity.exercise.fingerprint
      })
    ).toBe(true);
    expect(lesson.replaceNovelActivity(replacement.identity, 994)).toBe(false);
  });
  it("cannot replace fixed material or switch a nonauditory phase to visual auditory evidence", () => {
    const lesson = new IntegratedLesson({ lessonId: "fixed", plan });
    const snapshot = lesson.snapshot();
    expect(lesson.replaceNovelActivity(snapshot.identity, 22)).toBe(false);
    expect(lesson.useVisualAlternative(snapshot.identity)).toBe(false);
    start(lesson);
    expect(lesson.complete({ ...result(snapshot), auditoryVerified: true })).toBe(false);
  });
  it("repeats final control with fresh reproducible combinations and keeps earlier phase refs", () => {
    const lesson = new IntegratedLesson({ lessonId: "final-repeat", plan });
    finish(lesson);
    const previous = lesson.snapshot();
    expect(lesson.repeat("final-control")).toBe(true);
    for (let index = 0; index < 3; index++) {
      const before = lesson.snapshot();
      expect(lesson.replaceNovelActivity(before.identity, 900 + index)).toBe(true);
      const next = lesson.snapshot();
      expect(next.activity.id).toBe(before.activity.id);
      expect(next.activity.exercise.fingerprint).not.toBe(before.activity.exercise.fingerprint);
      complete(lesson);
      if (index < 2) expect(lesson.next(lesson.snapshot().identity)).toBe(true);
    }
    expect(lesson.snapshot().results.slice(0, 13)).toEqual(previous.results.slice(0, 13));
    expect(lesson.snapshot().results).toHaveLength(19);
    expect(lesson.snapshot().independentControl).toBe(true);
  });
  it("restores a completed phase result and permits the manual next phase without replay", () => {
    const lesson = new IntegratedLesson({ lessonId: "phase-boundary", plan });
    for (let index = 0; index < 5; index++) {
      complete(lesson);
      if (index < 4) lesson.next(lesson.snapshot().identity);
    }
    const saved = lesson.save();
    const restored = new IntegratedLesson({ lessonId: "phase-boundary", plan, saved });
    expect(restored.snapshot().status).toBe("phase-complete");
    expect(restored.snapshot().results).toHaveLength(5);
    expect(restored.next(restored.snapshot().identity)).toBe(true);
    expect(restored.snapshot().phaseId).toBe("read-melody");
    expect(restored.snapshot().ready).toBe(false);
    expect(restored.snapshot().results).toHaveLength(5);
    const child = new IntegratedLesson({ lessonId: "child-boundary", plan });
    complete(child);
    const resumedChild = new IntegratedLesson({
      lessonId: "child-boundary",
      plan,
      saved: child.save()
    });
    expect(resumedChild.snapshot().status).toBe("child-complete");
    expect(resumedChild.next(resumedChild.snapshot().identity)).toBe(true);
    expect(resumedChild.snapshot().activity.exercise.notes[0]?.pitch).toBe(62);
  });
  it("allows visual educational alternatives while withholding all independent auditory claims", () => {
    const lesson = new IntegratedLesson({ lessonId: "visual", plan });
    finish(lesson, true);
    expect(lesson.snapshot().completedPhases).toHaveLength(7);
    expect(lesson.snapshot().auditoryVerified).toBe(false);
    expect(lesson.snapshot().independentControl).toBe(false);
    for (const ref of lesson.snapshot().results.filter((r) => r.visualAlternative)) {
      expect(ref.auditoryVerified).toBe(false);
      expect(ref.purpose).toBe("training");
    }
  });
  it("requires an explicit training transition before control help can be saved", () => {
    const lesson = new IntegratedLesson({ lessonId: "help", plan });
    reach(lesson, "final-control");
    const control = start(lesson);
    const help = [{ atMs: 1, kind: "explanation" as const }];
    expect(lesson.complete({ ...result(control), help })).toBe(false);
    expect(lesson.useTrainingAlternative(control.identity)).toBe(true);
    expect(lesson.complete(result(control))).toBe(false);
    const training = start(lesson);
    expect(training.purpose).toBe("training");
    expect(lesson.complete({ ...result(training), help })).toBe(true);
    lesson.next(training.identity);
    finish(lesson);
    expect(lesson.snapshot().independentControl).toBe(false);
  });
});

function observations(
  skill: IntegratedEvidence["skill"],
  errors: readonly boolean[],
  patch: Partial<IntegratedObservation> = {}
): IntegratedObservation[] {
  return errors.map((hadErrors, index) => ({
    runId: `${skill}:${String(index)}`,
    skill,
    source: "keyboard",
    completed: true,
    nonempty: true,
    hadErrors,
    usedHelp: false,
    ...patch
  }));
}
describe("integrated recommendation policy v1", () => {
  it("uses the default ordered route with fewer than three completed nonempty observations", () => {
    expect(
      recommendIntegratedPhase(observations("interval", [true, true]), "keyboard", ["find-keys"])
    ).toEqual({ policyVersion: 1, kind: "route", phaseId: "read-melody" });
    expect(
      recommendIntegratedPhase(
        observations("interval", [true, true, true], { completed: false }),
        "keyboard",
        []
      ).kind
    ).toBe("route");
    expect(
      recommendIntegratedPhase(
        observations("interval", [true, true, true], { nonempty: false }),
        "keyboard",
        []
      ).kind
    ).toBe("route");
  });
  it("uses skill-specific error or help frequency and filters the input source", () => {
    const history = [
      ...observations("reading", [false, false, false]),
      ...observations("interval", [false, false, true], { usedHelp: true }),
      ...observations("harmony", [true, true, true], { source: "midi" })
    ];
    expect(recommendIntegratedPhase(history, "keyboard", []).phaseId).toBe("heard-intervals");
    expect(recommendIntegratedPhase(history, "midi", []).phaseId).toBe("build-chords");
    expect(recommendIntegratedPhase(history, "pointer", []).kind).toBe("route");
  });
  it("takes only the latest 12 eligible observations per skill/source", () => {
    const history = [
      ...observations("reading", [true, true, true]),
      ...observations("reading", Array<boolean>(12).fill(false)).map((r) => ({
        ...r,
        runId: `new:${r.runId}`
      })),
      ...observations("interval", [true, false, false])
    ];
    expect(recommendIntegratedPhase(history, "keyboard", []).phaseId).toBe("heard-intervals");
  });
  it("compares proportions rather than raw errors, retains phase order for ties and deduplicates runs", () => {
    const reading = observations("reading", [true, false, false]);
    const interval = observations("interval", [true, true, false, false, false, false]);
    expect(recommendIntegratedPhase([...interval, ...reading], "keyboard", []).phaseId).toBe(
      "read-melody"
    );
    const one = observations("harmony", [true]);
    expect(recommendIntegratedPhase([...one, ...one, ...one], "keyboard", []).kind).toBe("route");
  });
  it("returns to the main route after two successive same-skill recommendations", () => {
    const history = observations("interval", [true, true, true]);
    expect(
      recommendIntegratedPhase(history, "keyboard", ["find-keys"], ["heard-intervals"]).kind
    ).toBe("repeat");
    expect(
      recommendIntegratedPhase(
        history,
        "keyboard",
        ["find-keys"],
        ["heard-intervals", "heard-intervals"]
      )
    ).toEqual({ policyVersion: 1, kind: "route", phaseId: "read-melody" });
    expect(
      recommendIntegratedPhase(history, "keyboard", [], ["heard-intervals", "read-melody"]).kind
    ).toBe("repeat");
    expect(recommendIntegratedPhase([], "keyboard", INTEGRATED_PHASE_IDS).phaseId).toBeNull();
  });
  it("derives nonempty skill observations from child references without adding parent metrics", () => {
    const lesson = new IntegratedLesson({ lessonId: "observations", plan });
    complete(lesson);
    const rows = integratedObservations(lesson.snapshot().results);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      skill: "keyboard",
      source: "keyboard",
      completed: true,
      nonempty: true,
      hadErrors: false,
      usedHelp: false
    });
  });
});
