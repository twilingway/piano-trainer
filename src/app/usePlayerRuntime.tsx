import {
  dispatchMusicLessonAction,
  practiceLessonAction,
  lessonPlayback,
  completedPracticeTransport,
  restartBasicPractice
} from "./musicLessonAction";
import { useSettingsPlayback } from "./useSettingsPlayback";
import { useMusicCourse } from "./useMusicCourse";
import { useMusicTrainer, usePracticeDisplayPrefs, musicClockAllowed } from "./useMusicTrainer";
import { usePlayCountdown } from "./usePlayCountdown";
import { useAppSelector } from "./storeHooks";
import { useRef, useState } from "react";
import { useGameRuntime } from "./useGameRuntime";
import { useI18n } from "./useI18n";
import { useGameOptions } from "./useGameOptions";
import { useTimingControls } from "./useTimingControls";

import { useFallingView } from "./useFallingView";
import { useFullscreen } from "./useFullscreen";
import { useKeyInput } from "./useKeyInput";
import { useKeyboardSettings } from "./useKeyboardSettings";
import { useComputerKeyboard } from "./useComputerKeyboard";
import { useFreeCameraInput } from "./useFreeCameraInput";
import { usePlayerLibrary } from "./usePlayerLibrary";
import { useShortcuts } from "./useShortcuts";
import { useSong } from "./useSong";
import { useCourse } from "./useCourse";
import { useReadingCourse, useReadingTrainer } from "./useReadingCourse";
import { useRhythmCourse } from "./useRhythmCourse";
import { useTwoHandCourse, useTwoHandTrainer } from "./useTwoHandCourse";
import { useHeldBassCourse, useHeldBassTrainer } from "./useHeldBassCourse";
import {
  useIndependentRhythmCourse,
  useIndependentRhythmTrainer
} from "./useIndependentRhythmCourse";
import { useRhythmTrainer } from "./useRhythmTrainer";
import { useIntervalCourse } from "./useIntervalCourse";
import { useIntervalAudioTrainer } from "./useIntervalAudio";
import { DEFAULT_SCREEN_LAYOUT } from "./screenLayout";
import { useSound } from "./useSound";
import { useScreenLayout } from "./useScreenLayout";
import { useStaffPrefs } from "./useStaffPrefs";
import { useStaffScore } from "./useStaffScore";
import { useTakeReview } from "./useTakeReview";
import { useTrainer } from "./useTrainer";
import { ViewToggles } from "../ui/ViewToggles";
import { useWordTyping, useWordTypingInterfaceLanguage } from "./useWordTyping";
import { ConnectedWordSettings } from "./ConnectedSettings";
import { GameModeSwitch } from "../ui/GameModeSwitch";
import { PracticeTimingStatus, IndependentRhythmTimingStatus } from "../ui/PracticeTimingStatus";
import type { Part } from "../wordTyping/types";

import { useDeviceRange, useRangeFit } from "./useDeviceRange";
import { selectTrainerStatus, sameTrainerStatus, useTrainerSelector } from "./trainerSnapshots";

export function usePlayerRuntime() {
  const { t } = useI18n();
  const fullscreen = useFullscreen();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lessonWindow, setLessonWindow] = useState<string | null>(null);
  const [resultClosed, setResultClosed] = useState(false);
  /**
   * Song time practice starts from after a click on the staff; null = the beginning.
   * Kept across reloads (listen, speed, hand, mode), cleared by "Сначала" and a new song.
   */
  const startFromRef = useRef<number | null>(null);
  const { sound, ensureSound, ensureIntervalSound } = useSound();
  const current = useSong(startFromRef);
  const course = useCourse(current.showSong);
  const reading = useReadingCourse();
  const intervals = useIntervalCourse();
  const rhythm = useRhythmCourse();
  const twoHand = useTwoHandCourse();
  const heldBass = useHeldBassCourse();
  const independentRhythm = useIndependentRhythmCourse();
  const music = useMusicCourse();
  const lessonDialogsOpen =
    lessonWindow !== null ||
    libraryOpen ||
    settingsOpen ||
    twoHand.intro ||
    heldBass.intro ||
    independentRhythm.intro;
  const practiceActive =
    reading.active ||
    intervals.active ||
    rhythm.active ||
    twoHand.active ||
    heldBass.active ||
    independentRhythm.active ||
    music.active;
  const ear = intervals.active && intervals.mode === "hear-and-choose";
  const practiceExercise =
    music.scene ??
    independentRhythm.scene ??
    heldBass.scene ??
    twoHand.exercise ??
    rhythm.exercise ??
    intervals.exercise ??
    reading.exercise;
  const song = practiceExercise?.song ?? current.song;
  const songKey = practiceExercise?.id ?? current.songKey;
  const word = useWordTyping(song, songKey, libraryOpen || settingsOpen, practiceActive);
  const device = useDeviceRange();
  const { playable } = device;
  const game = useGameOptions(
    word.practiceKey,
    word.practiceSong.duration,
    word.enabled,
    playable,
    practiceActive || course.active !== null
  );
  const { staffPrefs, updateStaffPrefs } = useStaffPrefs();
  const screen = useScreenLayout(word.enabled ? "typing" : "piano");
  const workspaceLayout = practiceActive ? DEFAULT_SCREEN_LAYOUT : screen.layout;
  const displayPrefs = usePracticeDisplayPrefs({
    practiceActive,
    ear,
    music,
    staffPrefs,
    performance: game.performance,
    courseActive: course.active !== null,
    courseView: course.saved.view
  });
  const score = useStaffScore(song, current.baseSong, displayPrefs);
  const takes = useTakeReview(word.practiceSong, word.practiceKey, ensureSound, {
    withNames: score.withNames,
    fixedLines: score.fixedLines,
    measuresPerLine: staffPrefs.measuresPerLine,
    autoReview: !practiceActive && staffPrefs.autoReview
  });
  const trainer = useTrainer({
    song: word.practiceSong,
    sourceSong: practiceExercise?.song ?? current.sourceSong,
    reading: reading.active || intervals.active || twoHand.active || heldBass.active,
    readingHand: twoHand.active || heldBass.active ? "both" : reading.isBass ? "left" : "right",
    rhythm: rhythm.active,
    independentRhythm: independentRhythm.active,
    music: music.options,
    pianoBlocked: ear || rhythm.active,
    songKey: word.practiceKey,
    wordTyping: word.enabled,
    startFromRef,
    ensureSound,
    onNoteClick: current.cycleFinger,
    onTake: practiceActive ? () => undefined : takes.recordTake,
    onRunFinished: music.active
      ? () => undefined
      : independentRhythm.active
        ? () => undefined
        : heldBass.active
          ? heldBass.finish
          : twoHand.active
            ? twoHand.finish
            : rhythm.active
              ? () => undefined
              : intervals.active
                ? intervals.publish
                : reading.active
                  ? reading.finish
                  : course.controller.finish,
    course: practiceActive ? undefined : course.practice,
    compareSong: takes.compareSong,
    lastTake: takes.lastTake,
    replayCount: takes.replayCount,
    comparing: !practiceActive && takes.comparing,
    onReplay: takes.replay,
    gameOptions: game.options,
    ranked: !practiceActive && game.ranked
  });
  useReadingTrainer(
    intervals.active ? intervals : reading,
    trainer.trainerRef,
    trainer.trainerReady,
    lessonDialogsOpen || reading.intro
  );
  useTwoHandTrainer(twoHand, trainer.trainerRef, trainer.trainerReady, lessonDialogsOpen);
  useHeldBassTrainer(
    heldBass,
    trainer.trainerRef,
    trainer.trainerReady,
    lessonDialogsOpen || reading.intro
  );
  useIntervalAudioTrainer(
    intervals.audio,
    intervals.session,
    trainer.trainerRef,
    trainer.trainerReady,
    lessonDialogsOpen || reading.intro,
    intervals.publish
  );
  const workspacePrefs =
    !practiceActive && course.active && takes.comparing
      ? { ...displayPrefs, visible: true }
      : displayPrefs;
  const snapshot = useTrainerSelector(
    trainer.snapshotSource,
    selectTrainerStatus,
    sameTrainerStatus
  );
  const countdownSeconds = useAppSelector((state) => state.preferences.player.countdownSeconds);
  const countdown = usePlayCountdown({
    seconds: countdownSeconds,
    playing: ear ? !intervals.audio.paused : snapshot.playing,
    finished: snapshot.finished,
    song: word.practiceSong,
    context: JSON.stringify([
      word.practiceKey,
      trainer.mode,
      trainer.handChoice,
      trainer.speed,
      ear,
      takes.comparing
    ]),
    blocked:
      music.active ||
      lessonWindow !== null ||
      libraryOpen ||
      (settingsOpen && practiceActive) ||
      (word.enabled && (word.pending || Boolean(word.error))),
    prepare: ensureIntervalSound,
    onToggle: playNow
  });
  useWordTypingInterfaceLanguage(word, snapshot.playing);
  const computerKeyboard = useComputerKeyboard();
  const cameraInput = useFreeCameraInput(
    workspacePrefs,
    computerKeyboard.options,
    libraryOpen ||
      settingsOpen ||
      computerKeyboard.editing ||
      word.enabled ||
      ear ||
      twoHand.intro ||
      heldBass.intro ||
      independentRhythm.intro
  );
  const input = useKeyInput(
    trainer.trainerRef,
    ear || rhythm.active
      ? { ...cameraInput.keyboard, blocked: true }
      : word.enabled
        ? word.keyboardOptions
        : cameraInput.keyboard,
    music.active || rhythm.active || independentRhythm.active ? undefined : device.intercept,
    trainer.trainerReady,
    ear || countdown.active,
    rhythm.active || independentRhythm.active,
    music.active || independentRhythm.active,
    snapshot.playing
  );
  const fit = useRangeFit(
    song.notes,
    trainer.playerHands,
    playable,
    current,
    !word.enabled && !practiceActive
  );
  const timing = useTimingControls({
    trainerRef: trainer.trainerRef,
    ensureSound,
    devices: input.devices,
    deviceId: input.midiDeviceId,
    trainerReady: trainer.trainerReady,
    snapshotSource: trainer.snapshotSource,
    localInput:
      (rhythm.active && rhythm.source !== "midi") ||
      (independentRhythm.active && independentRhythm.source !== "midi") ||
      (music.active && music.source !== "midi"),
    locked: game.ranked && snapshot.playing
  });
  useGameRuntime(trainer.trainerRef, trainer.trainerReady, {
    loop: !practiceActive && game.range.loop,
    ranked: !practiceActive && game.ranked,
    stopOnError: !practiceActive && game.stopOnError,
    rankedReady: timing.rankedReady,
    performance: !practiceActive && game.performance,
    canStart:
      musicClockAllowed(music.active, music.view) &&
      !ear &&
      !twoHand.intro &&
      !heldBass.intro &&
      !independentRhythm.intro &&
      !reading.intro &&
      (!word.enabled || (!word.pending && !word.error)),
    resumeWhenReady: word.enabled && !music.active,
    deviceId: timing.profile?.deviceId ?? ""
  });
  useRhythmTrainer(
    rhythm,
    trainer.trainerRef,
    trainer.trainerReady,
    lessonDialogsOpen || reading.intro,
    input.devices,
    input.midiDeviceId
  );
  useIndependentRhythmTrainer(
    independentRhythm,
    trainer.trainerRef,
    trainer.trainerReady,
    lessonDialogsOpen || reading.intro,
    input.devices,
    input.midiDeviceId
  );
  useMusicTrainer(
    music,
    trainer.trainerRef,
    trainer.trainerReady,
    lessonDialogsOpen || reading.intro || computerKeyboard.editing,
    input.devices,
    input.midiDeviceId
  );
  const view = useFallingView({
    hostRef: trainer.hostRef,
    hasScore: Boolean(music.active ? music.staffXml : score.staffXml),
    viewRef: trainer.viewRef,
    trainerRef: trainer.trainerRef,
    trainerReady: trainer.trainerReady,
    song: word.practiceSong,
    baseSong: practiceActive || word.enabled ? word.practiceSong : current.baseSong,
    staffPrefs: workspacePrefs,
    cameraInputBlocked: !cameraInput.enabled,
    updateStaffPrefs,
    fallingNames: score.nameStyle,
    comparing: !practiceActive && takes.comparing,
    lastTake: takes.lastTake,
    computerKeys: word.keyboard,
    placement: {
      lift: workspaceLayout.keysLift,
      scale: workspaceLayout.keysScale,
      x: workspaceLayout.keysX,
      y: workspaceLayout.keysY
    }
  });
  const library = usePlayerLibrary({
    showSong: current.showSong,
    setLibrarySource: current.setLibrarySource,
    openLesson: current.openLesson
  });

  // The shell: one bar, the song's progress, windows for the library and the settings.
  const playing = snapshot.playing;
  const completedPractice = completedPracticeTransport(
    { reading, intervals, twoHand, heldBass, rhythm, independentRhythm },
    sound === "loading" || lessonDialogsOpen
  );

  function playNow() {
    setResultClosed(false);
    if (lessonWindow !== null) return;
    if (music.active) {
      dispatchMusicLessonAction(music.view, music.command, music.cancel);
    } else if (independentRhythm.active) {
      if (snapshot.playing) independentRhythm.cancel();
      else void independentRhythm.onStart();
    } else if (rhythm.active) {
      if (snapshot.playing) rhythm.cancel();
      else void rhythm.onStart();
    } else if (ear) {
      if (intervals.audio.paused || intervals.snapshot?.listening) intervals.audio.togglePause();
      else intervals.audio.listen();
    } else void trainer.togglePlay();
  }
  const songPlay = useSettingsPlayback(
    countdown,
    settingsOpen,
    practiceActive,
    playing,
    computerKeyboard,
    timing.settingsProps.running
  );
  const play =
    completedPractice?.invoke ??
    lessonPlayback(lessonWindow !== null, music.active || ear, playNow, songPlay);
  const lessonAction = practiceLessonAction({
    music: music.active ? music.view : undefined,
    completed: completedPractice?.action,
    ear,
    paused: intervals.audio.paused,
    listening: intervals.snapshot?.listening ?? false,
    counting: countdown.active,
    playing,
    cancelsAttempt: rhythm.active || independentRhythm.active,
    blocked: sound === "loading" || lessonWindow !== null
  });
  const startOver = () => {
    countdown.resetNewRun();
    setResultClosed(false);
    if (music.active) music.command("retry");
    else
      restartBasicPractice(
        { reading, intervals, twoHand, heldBass, rhythm, independentRhythm },
        trainer.restart
      );
  };
  useShortcuts({
    play,
    blocked:
      music.active ||
      rhythm.active ||
      independentRhythm.active ||
      (word.enabled
        ? libraryOpen || settingsOpen || word.pending || Boolean(word.error)
        : computerKeyboard.editing)
  });

  const toggles = !practiceActive && (
    <ViewToggles
      prefs={staffPrefs}
      hasScore={Boolean(score.staffXml)}
      onChange={updateStaffPrefs}
      courseScore={
        course.active && !takes.comparing
          ? { view: course.saved.view, onView: course.setView }
          : undefined
      }
    />
  );
  const keyboardSettings = useKeyboardSettings(view, staffPrefs, updateStaffPrefs);

  const chooseWordPart = (part: Part) => {
    startFromRef.current = null;
    word.choosePart(part);
  };
  const wordSettings = <ConnectedWordSettings />;

  const chooseGame = (enabled: boolean) => {
    if (practiceActive) reading.exit();
    computerKeyboard.endEditing();
    startFromRef.current = null;
    word.update({ enabled });
  };
  const timingStatus = independentRhythm.active ? (
    <IndependentRhythmTimingStatus />
  ) : (
    <PracticeTimingStatus policy={snapshot.timingPolicy} ranked={game.ranked} />
  );
  const modeSwitch = (
    <GameModeSwitch wordTyping={word.enabled} locked={playing} onChange={chooseGame}>
      {word.enabled && wordSettings}
      {timingStatus}
    </GameModeSwitch>
  );

  return {
    music,
    lessonWindow,
    setLessonWindow,
    lessonAction,
    independentRhythm,
    heldBass,
    twoHand,
    reading,
    rhythm,
    intervals,
    practiceActive,
    displayPrefs: workspacePrefs,
    sound,
    t,
    fullscreen,
    libraryOpen,
    setLibraryOpen,
    settingsOpen,
    setSettingsOpen,
    resultClosed,
    setResultClosed,
    current,
    course,
    song,
    word,
    device,
    game,
    staffPrefs,
    updateStaffPrefs,
    screen: { ...screen, layout: workspaceLayout },
    score,
    takes,
    trainer: {
      ...trainer,
      seekToBeat: (beat: number) => {
        countdown.cancel();
        trainer.seekToBeat(beat);
      }
    },
    countdown: countdown.countdown,
    snapshot,
    computerKeyboard,
    input,
    fit,
    timing,
    view,
    library,
    listening: trainer.listening,
    review: practiceActive ? null : takes.review,
    lastTake: takes.lastTake,
    comparing: !practiceActive && takes.comparing,
    playing: music.active
      ? ["playing", "listening", "reply"].includes(music.view.status)
      : ear
        ? !intervals.audio.paused
        : playing,
    play,
    startOver,
    toggles,
    keyboardSettings,
    wordSettings,
    chooseWordPart,
    chooseGame,
    timingStatus,
    modeSwitch
  };
}
