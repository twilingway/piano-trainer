import type { PracticeSession, PracticeOptions } from "../practice/session";
import type { MusicExercise } from "../musicLearning/types";
import type { MusicGroupAnswer } from "../musicLearning/progress";
import type { IntegratedLesson, IntegratedPlan } from "../musicLearning/integrated";
import type { IntegratedChildResult } from "../musicLearning/integrated";
import type { IntegratedPhaseId } from "../musicLearning/integrated";
import { musicXmlWithFingering } from "../song/musicxml";
import { musicControllerRepeatChoices } from "./musicCourseControllerRecommendations";
import { musicCourseFingerCues } from "./musicCourseFingerCues";
import { INTEGRATED_PHASE_IDS } from "../musicLearning/integratedPlan";
import type { MusicControlGroupQuestion } from "./musicCourseControllerGroups";
import type { HarmonyInputFailure } from "../musicLearning/harmonyInput";
import { assessSightStartingPosition } from "../musicLearning/sightReading";
import type { SightReadingPreview } from "../musicLearning/sightReadingPreview";
import { sightReadingAheadXml } from "../musicLearning/sightReadingScore";
import { musicProgressionPrompt, type MusicActivity } from "./musicCourseExercise";
import type { MusicRunIdentity, MusicCourseRun } from "./musicCourseRun";
import type { MusicCourseSnapshot } from "./musicCourseContracts";
import type { MusicPersistentState } from "./musicPersistence";
import type {
  MusicCourseStatus,
  MusicCourseText,
  MusicCourseResultView,
  MusicCourseChoice
} from "../ui/musicCourseTypes";

export interface MusicControllerState {
  scene: MusicExercise | null;
  activity: MusicActivity | null;
  identity: MusicRunIdentity | null;
  run: MusicCourseRun | null;
  preview: SightReadingPreview | null;
  session: PracticeSession | null;
  lesson: IntegratedLesson | null;
  plan: IntegratedPlan | null;
  presented: boolean;
  status: MusicCourseStatus;
  error: MusicCourseText | undefined;
  visualAlternative: boolean;
  helpShown: boolean;
  hint: boolean;
  positionReady: boolean;
  groupReady: boolean;
  positionLowPitch: number | undefined;
  feedback: string | undefined;
  groupAnswers: MusicGroupAnswer[];
  newMaterial: boolean;
  startedAt: number;
  result: MusicCourseResultView | undefined;
  savedResult: boolean;
  canNext: boolean;
  options: PracticeOptions;
  aheadIndex: number;
  aheadXml: string | undefined;
  choiceSource: "keyboard" | "pointer" | undefined;
  staffRequired: boolean;
  policyAttached: boolean;
  previousRecommendations: IntegratedPhaseId[];
  fingeringSource: string | undefined;
  fingeringXml: string | undefined;
  controlGroup: MusicControlGroupQuestion | null;
}
export function createMusicControllerState(): MusicControllerState {
  return {
    scene: null,
    activity: null,
    identity: null,
    run: null,
    preview: null,
    session: null,
    lesson: null,
    plan: null,
    presented: false,
    status: "preparation",
    error: undefined,
    visualAlternative: false,
    helpShown: false,
    hint: false,
    positionReady: false,
    groupReady: false,
    positionLowPitch: undefined,
    feedback: undefined,
    groupAnswers: [],
    newMaterial: false,
    startedAt: 0,
    result: undefined,
    savedResult: false,
    canNext: false,
    options: musicControllerOptions(null),
    aheadIndex: -2,
    aheadXml: undefined,
    choiceSource: undefined,
    staffRequired: true,
    policyAttached: false,
    previousRecommendations: [],
    fingeringSource: undefined,
    fingeringXml: undefined,
    controlGroup: null
  };
}
export function musicControllerOptions(activity: MusicActivity | null): PracticeOptions {
  const learning = activity?.purpose !== "control";
  const piano = activity?.taskKind === "sight-reading";
  const accompaniment = activity?.taskKind === "accompaniment";
  return {
    mode: piano && learning ? "wait" : "tempo",
    hands: new Set(accompaniment ? ["left"] : ["left", "right"]),
    speed: 1,
    accompaniment,
    noteResult: false,
    learningWindow: false,
    countInBeats:
      activity?.dictation || activity?.chords || activity?.expectedChoice !== undefined ? 0 : 4
  };
}
const POSITION_PITCHES = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
const GROUP_CHOICES: readonly MusicCourseChoice[] = [
  { value: "scalar", labelKey: "Поступенное движение" },
  { value: "triadic", labelKey: "Движение по трезвучию" },
  { value: "repeated", labelKey: "Повторяющиеся звуки" },
  { value: "mixed", labelKey: "Смешанный рисунок" }
];
const PHASES: Record<string, string> = {
  "find-keys": "Найдите клавиши до–соль",
  "read-melody": "Прочитайте новую мелодию",
  "heard-rhythm": "Повторите услышанный ритм",
  "heard-intervals": "Узнайте и сыграйте интервал",
  "build-chords": "Постройте три аккорда",
  "play-piece": "Сыграйте пьесу двумя руками",
  "final-control": "Проверьте навыки на новом материале"
};
const CHORD_FEEDBACK: Readonly<Partial<Record<HarmonyInputFailure, string>>> = {
  "extra-note": "В аккорде есть лишний звук. Отпустите клавиши и попробуйте снова.",
  "octave-duplicate": "В этом задании октавный дубль не допускается. Отпустите клавиши.",
  "wrong-bass": "Проверьте нижний звук аккорда.",
  "wrong-position": "Сыграйте указанные высоты в заданной октаве.",
  "too-slow": "Нажмите звуки аккорда вместе, в пределах 200 мс.",
  "early-release": "Удерживайте все звуки аккорда до подтверждения.",
  "mixed-origin": "Сыграйте аккорд одним выбранным устройством."
};

export function musicControllerSnapshot(
  state: MusicControllerState,
  saved: MusicPersistentState,
  blocked: boolean
): MusicCourseSnapshot {
  const a = state.activity;
  const run = state.run?.snapshot();
  const hearing = state.run?.listeningSummary();
  const preview = state.preview?.snapshot();
  const preparationDone =
    (!preview || preview.phase === "ready" || preview.phase === "started") &&
    state.positionReady &&
    state.groupReady;
  const allReleased = run?.allReleased ?? true;
  const error =
    state.error ??
    (run?.valid === false ? { key: "Ответ прерван. Начните новую попытку." } : undefined);
  const result = state.status === "result" || state.status === "completed";
  const ready =
    (result || (state.staffRequired ? state.presented : state.policyAttached)) &&
    !blocked &&
    !error;
  const active = state.status === "playing" || state.status === "reply";
  const training = a?.purpose === "training";
  const question = state.controlGroup;
  let taskKind = a?.taskKind ?? "integrated";
  let choices = a?.choices ?? [];
  if (training && a.sight && !run?.started) {
    if (!state.positionReady) {
      taskKind = "position";
      const sight = a.sight;
      const suitable = POSITION_PITCHES.findIndex(
        (pitch) => assessSightStartingPosition(sight, "right", pitch).suitable
      );
      choices = POSITION_PITCHES.slice(
        Math.max(0, suitable - 2),
        Math.max(0, suitable - 2) + 5
      ).map((pitch) => ({
        value: `position:${String(pitch)}`,
        labelKey: "Позиция руки от ноты {note}",
        pitch
      }));
    } else if (!state.groupReady) {
      taskKind = "group";
      choices = GROUP_CHOICES;
    }
  }
  if (!result) {
    if (a?.auditory && !state.visualAlternative)
      choices = [
        ...choices,
        { value: "visual-alternative", labelKey: "Перейти к зрительной тренировке" }
      ];
    if (a?.purpose === "control")
      choices = [
        ...choices,
        { value: "training-alternative", labelKey: "Перейти к тренировке с подсказкой" }
      ];
  }
  const repeats = musicControllerRepeatChoices(state, saved);
  if (result) choices = repeats;
  if (question) {
    taskKind = "group";
    choices = GROUP_CHOICES;
  }
  let staffVisible =
    !!state.scene &&
    (!a?.auditory || state.visualAlternative || result) &&
    (!preview || preview.scoreVisible || result);
  if (!state.presented && state.scene && !result) staffVisible = !a?.auditory;
  let staffXml = state.scene?.musicXml;
  if (question) {
    staffXml = question.musicXml;
    staffVisible = true;
  }
  if (a && staffVisible && a.taskKind === "progression") staffXml = musicProgressionPrompt(a);
  if (a?.sight && training && run?.started && state.session && !result) {
    const atBeat = (state.session.time * a.exercise.bpm) / 60;
    const index = a.sight.groups.findIndex((group) => atBeat < group.endBeat);
    if (index !== state.aheadIndex) {
      state.aheadIndex = index;
      state.aheadXml = sightReadingAheadXml(a.sight, atBeat);
    }
    staffXml = state.aheadXml;
  }
  const integrated = state.lesson?.snapshot();
  const fingeringVisible = !!a?.sight && training && state.helpShown && staffVisible;
  if (fingeringVisible && staffXml) {
    if (state.fingeringSource !== staffXml) {
      state.fingeringSource = staffXml;
      state.fingeringXml = musicXmlWithFingering(staffXml, a.exercise.song.notes);
    }
    staffXml = state.fingeringXml;
  }
  const instruction =
    state.feedback ??
    (state.status === "preview"
      ? "Рассмотрите фразу. После предпросмотра начните исполнение вручную."
      : undefined) ??
    (state.status === "ready" && a?.sight && preview?.phase === "ready"
      ? "Предпросмотр завершён. Нажмите «Начать задание», чтобы сыграть фразу."
      : undefined) ??
    (state.status === "preflight"
      ? state.positionReady
        ? "Определите рисунок первой группы. Затем начнётся предпросмотр."
        : "Выберите начальную позицию руки. Предпросмотр начнётся после подготовки."
      : undefined) ??
    (question ? "Как устроена группа {number}? Выберите её рисунок." : undefined) ??
    (state.visualAlternative
      ? "Посмотрите фразу на стане и повторите её на клавишах. Слух в этом задании не оценивается."
      : undefined) ??
    (!result && run?.chordError ? CHORD_FEEDBACK[run.chordError] : undefined) ??
    (a?.integrated?.kind === "find-key"
      ? "Найдите ноту на стане и нажмите её клавишу."
      : a?.integrated?.kind === "interval"
        ? "Послушайте два звука, назовите интервал и сыграйте обе ноты."
        : undefined);
  return {
    scene: state.scene,
    options: state.options,
    staffXml,
    staffVisible,
    keysVisible:
      !question && !!state.scene && (!a?.sight || preview?.phase === "started" || result),
    fingeringVisible,
    fingerCues: musicCourseFingerCues(state, blocked),
    view: {
      course: saved.course ?? "integrated",
      inputSource: saved.inputSource,
      status: error ? "error" : state.status,
      taskKind,
      ready,
      allReleased,
      canStart:
        ready &&
        !question &&
        !run?.finished &&
        preparationDone &&
        allReleased &&
        !active &&
        !result &&
        state.status !== "listening" &&
        (!a?.auditory || !!hearing?.canReply || state.visualAlternative),
      canListen:
        ready &&
        !question &&
        !result &&
        !!a &&
        !a.sight &&
        !!hearing?.canListen &&
        state.status !== "listening",
      canFinish:
        ready &&
        !question &&
        !!run?.canFinish &&
        allReleased &&
        !result &&
        state.status !== "listening",
      canNext: result && state.canNext,
      canHelp: training && !result,
      showHelp: state.helpShown,
      canRetry: true,
      retryCreatesNewMaterial: !!a?.noveltyRequired,
      canAnswer:
        ready &&
        (!result || repeats.length > 0) &&
        state.status !== "listening" &&
        (taskKind === "position" ||
          taskKind === "group" ||
          !!run?.started ||
          !!a?.auditory ||
          a?.purpose === "control" ||
          repeats.length > 0),
      choices,
      ...(a?.dictation?.startMode === "known" && a.exercise.notes[0]
        ? { startPitch: a.exercise.notes[0].pitch }
        : {}),
      ...(preview?.phase === "preview"
        ? { previewSeconds: Math.ceil(preview.remainingMs / 1000) }
        : {}),
      ...(state.positionLowPitch === undefined ? {} : { positionLowPitch: state.positionLowPitch }),
      ...(instruction ? { instructionKey: instruction } : {}),
      ...(question ? { instructionParams: { number: question.index + 1 } } : {}),
      ...(error ? { error } : {}),
      ...(state.result ? { result: state.result } : {}),
      ...(state.helpShown
        ? {
            helpKeys: [
              "Пальцы на нотах — рекомендации. Стандартный MIDI не определяет фактический палец."
            ]
          }
        : {}),
      ...(integrated
        ? {
            phaseKey:
              state.status === "completed"
                ? "Музыкальный урок завершён"
                : PHASES[integrated.phaseId],
            counter: {
              current: INTEGRATED_PHASE_IDS.indexOf(integrated.phaseId) + 1,
              total: 7
            }
          }
        : {})
    }
  };
}
const CHILD_METRICS: Readonly<Record<string, string>> = {
  wrongKeys: "Ошибки высоты",
  pitches: "Ошибки высоты",
  timing: "Ошибки ритма",
  groups: "Ошибки распознавания групп",
  onsets: "Ошибки ритма",
  durations: "Ошибки удержания",
  missing: "Пропущенные ноты",
  extra: "Лишние ноты",
  recognition: "Ошибки определения",
  bass: "Ошибки баса",
  synchrony: "Ошибки одновременности",
  left: "Ошибки левой руки",
  right: "Ошибки правой руки"
};
export function musicControllerChildView(
  child: IntegratedChildResult,
  complete: boolean,
  newMaterial: boolean
): MusicCourseResultView {
  return {
    summaryKey: complete
      ? "Этап музыкального урока завершён."
      : "Ответ пока неполный. Повторите текущий этап.",
    metrics: Object.entries(child.errors).map(([key, value]) => ({
      labelKey: CHILD_METRICS[key] ?? "Ошибки высоты",
      value:
        key === "groups" &&
        value === 0 &&
        !child.evidence?.inputJournal.events.some(
          (event) =>
            event.kind === "choice" &&
            event.eligible &&
            ["scalar", "triadic", "repeated", "mixed"].includes(event.value)
        )
          ? null
          : value
    })),
    helped: child.help.length > 0 || child.visualAlternative,
    ...(child.evidence && child.skill !== "harmony"
      ? {
          notes: {
            expectedNotes: child.evidence.material.notes,
            playedNotes: child.evidence.notes
          }
        }
      : {}),
    newMaterial
  };
}
export function musicControllerFrameSignature(state: MusicControllerState): string {
  const run = state.run?.snapshot();
  const group = state.activity?.sight?.groups.findIndex(
    (item) =>
      ((state.session?.time ?? 0) * (state.activity?.exercise.bpm ?? 60)) / 60 < item.endBeat
  );
  return JSON.stringify([
    state.status,
    state.preview && Math.ceil(state.preview.snapshot().remainingMs / 1000),
    run?.finished,
    run?.chordIndex,
    run?.chordError,
    state.hint ? state.session?.nextDue().map((note) => note.id) : undefined,
    group
  ]);
}
