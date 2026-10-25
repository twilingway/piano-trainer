import { startPianoSound } from "../audio/pianoSound";
import { assessSightStartingPosition, assessSightGroup } from "../musicLearning/sightReading";
import type { SightGroupKind } from "../musicLearning/sightReading";
import type { MusicCourseCommand } from "../ui/musicCourseTypes";
import type {
  MusicCourseSelection,
  MusicCourseCallbacks,
  MusicCourseConnection,
  MusicCourseSnapshot
} from "./musicCourseContracts";
import type { MusicControllerState } from "./musicCourseControllerView";
import { musicActivityFromIntegrated } from "./musicCourseExercise";
import type { MusicActivity } from "./musicCourseExercise";
import type { MusicControllerAudio } from "./musicCourseControllerAudio";
import type { IntegratedPhaseId } from "../musicLearning/integrated";
import { musicControllerRepeatPhase } from "./musicCourseControllerRecommendations";
import { answerMusicControlGroup } from "./musicCourseControllerGroups";

export interface MusicControllerActionsHost {
  readonly state: MusicControllerState;
  readonly selection: MusicCourseSelection;
  readonly callbacks: MusicCourseCallbacks;
  readonly audio: MusicControllerAudio;
  readonly active: () => boolean;
  readonly snapshot: () => MusicCourseSnapshot;
  readonly generation: () => number;
  readonly valid: (generation: number, id: string | undefined) => boolean;
  readonly connection: () => MusicCourseConnection;
  readonly offset: () => number;
  readonly publish: () => void;
  readonly stop: () => void;
  readonly prepare: () => void;
  readonly complete: () => void;
  readonly cancel: () => void;
  readonly saveLesson: () => void;
  readonly install: (activity: MusicActivity) => void;
  readonly retry: () => void;
  readonly next: () => void;
  readonly repeat: (phase: IntegratedPhaseId) => void;
}
export function musicControllerCommand(
  host: MusicControllerActionsHost,
  command: MusicCourseCommand
): void {
  const { state, callbacks } = host;
  if (!host.active()) return;
  if (command === "exit") {
    host.cancel();
    callbacks.exit();
    return;
  }
  if (command === "retry") {
    host.retry();
    return;
  }
  if (command === "next") {
    if (!state.canNext || (state.run && !state.run.snapshot().allReleased)) return;
    host.next();
    return;
  }
  if (command === "start") {
    void start(host);
    return;
  }
  if (command === "finish") {
    if (host.snapshot().view.canFinish) host.complete();
    return;
  }
  if (command === "listen") {
    if (!host.snapshot().view.canListen) return;
    state.run?.pause(true, Math.max(0, performance.now() - host.offset()));
    host.stop();
    const generation = host.generation(),
      id = state.identity?.presentationId;
    host.audio.listen(state, () => host.valid(generation, id), host.publish);
    return;
  }
  if (state.activity?.purpose === "training" && !state.savedResult) {
    const firstHelp = !state.helpShown;
    state.helpShown = true;
    state.hint = command === "hint";
    state.run?.addHelp({
      atMs: performance.now(),
      kind: command === "hint" ? "key-light" : "explanation"
    });
    if (firstHelp && state.activity.sight)
      state.run?.addHelp({ kind: "fingering", atMs: performance.now() });
    const sight = state.activity.sight;
    if (sight)
      state.positionLowPitch = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72].find(
        (pitch) => assessSightStartingPosition(sight, "right", pitch).suitable
      );
    host.publish();
  }
}
async function start(host: MusicControllerActionsHost): Promise<void> {
  if (!host.snapshot().view.canStart || !host.connection().trainer) return;
  const generation = host.generation(),
    id = host.state.identity?.presentationId;
  try {
    if (!host.state.visualAlternative) await startPianoSound();
  } catch {
    if (host.valid(generation, id)) {
      host.state.feedback = "Не удалось включить звук. Повторите попытку.";
      host.publish();
    }
    if (host.state.activity?.auditory) return;
  }
  if (host.valid(generation, id) && host.snapshot().view.canStart)
    host.connection().trainer?.setPlaying(true);
}
export function musicControllerChoose(
  host: MusicControllerActionsHost,
  value: string,
  source: "keyboard" | "pointer"
): void {
  const { state } = host;
  const phase = musicControllerRepeatPhase(value);
  if (
    phase &&
    host.active() &&
    host.snapshot().view.canAnswer &&
    host.snapshot().view.choices?.some((choice) => choice.value === value)
  ) {
    host.repeat(phase);
    return;
  }
  if (
    !host.active() ||
    !host.snapshot().view.ready ||
    state.savedResult ||
    state.status === "listening"
  )
    return;
  if (value === "visual-alternative" || value === "training-alternative") {
    alternative(host, value === "visual-alternative");
    return;
  }
  if (answerMusicControlGroup(host, value, source)) return;
  const sight = state.activity?.sight;
  if (sight && state.activity?.purpose === "training" && !state.run?.snapshot().started) {
    state.run?.recordChoice(value, source, performance.now());
    if (value.startsWith("position:")) {
      state.positionReady = assessSightStartingPosition(
        sight,
        "right",
        Number(value.slice(9))
      ).suitable;
      state.feedback = state.positionReady
        ? undefined
        : "Выберите позицию, в которой помещается начало фразы.";
    } else if (["scalar", "triadic", "repeated", "mixed"].includes(value) && state.positionReady) {
      const answer = value as SightGroupKind,
        expected = sight.groups[0]?.kind;
      if (expected) state.groupAnswers.push({ expected, answer });
      state.groupReady = assessSightGroup(sight, 0, answer);
      state.feedback = state.groupReady
        ? undefined
        : "Сравните шаги и скачки в первой группе и выберите снова.";
    }
    host.publish();
    return;
  }
  if (state.run?.choose(value, source, performance.now())) {
    state.choiceSource = source;
    if (state.run.snapshot().finished) host.complete();
    host.publish();
  }
}
function alternative(host: MusicControllerActionsHost, visual: boolean): void {
  const { state } = host;
  if (!state.activity || !state.identity || (visual && !state.activity.auditory)) return;
  const originalActivity = state.activity;
  host.cancel();
  const lesson = state.lesson;
  if (
    lesson &&
    !(visual
      ? lesson.useVisualAlternative(lesson.snapshot().identity)
      : lesson.useTrainingAlternative(lesson.snapshot().identity))
  )
    return;
  const original = lesson
    ? musicActivityFromIntegrated(lesson.snapshot().activity)
    : originalActivity;
  const { dictation: _dictation, ...withoutDictation } = original;
  const activity: MusicActivity = visual
    ? { ...withoutDictation, purpose: "training", auditory: false }
    : { ...original, purpose: "training" };
  host.install(activity);
  state.visualAlternative = visual;
  state.newMaterial = false;
  state.run?.addHelp({ kind: "explanation", atMs: performance.now() });
  host.saveLesson();
  host.publish();
}
