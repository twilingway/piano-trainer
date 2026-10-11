import { useMemo, useRef, useState } from "react";
import { useGameRuntime } from "./useGameRuntime";
import { useI18n } from "./useI18n";
import { useGameOptions } from "./useGameOptions";
import { useTimingControls } from "./useTimingControls";

import { useFallingView } from "./useFallingView";
import { useFullscreen } from "./useFullscreen";
import { useKeyInput } from "./useKeyInput";
import { useKeyboardSettings } from "./useKeyboardSettings";
import { useComputerKeyboard } from "./useComputerKeyboard";
import { usePlayerLibrary } from "./usePlayerLibrary";
import { useShortcuts } from "./useShortcuts";
import { useSong } from "./useSong";
import { useCourse } from "./useCourse";
import { useReadingCourse, useReadingTrainer } from "./useReadingCourse";
import { useIntervalCourse } from "./useIntervalCourse";
import { useIntervalAudioTrainer } from "./useIntervalAudio";
import { readingDisplayProfile } from "./readingProfile";
import { DEFAULT_SCREEN_LAYOUT } from "./screenLayout";
import { useSound } from "./useSound";
import { useScreenLayout } from "./useScreenLayout";
import { useStaffPrefs } from "./useStaffPrefs";
import { useStaffScore } from "./useStaffScore";
import { useTakeReview } from "./useTakeReview";
import { useTrainer } from "./useTrainer";
import { ViewToggles } from "../ui/ViewToggles";
import { useWordTyping, useWordTypingInterfaceLanguage } from "./useWordTyping";
import { WordTypingSettings } from "../ui/WordTypingSettings";
import { GameModeSwitch } from "../ui/GameModeSwitch";
import { PracticeTimingStatus } from "../ui/PracticeTimingStatus";
import type { Part } from "../wordTyping/types";

import { useDeviceRange, useRangeFit } from "./useDeviceRange";
import { selectTrainerStatus, sameTrainerStatus, useTrainerSelector } from "./trainerSnapshots";

export function usePlayerRuntime() {
  const { t } = useI18n();
  const fullscreen = useFullscreen();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultClosed, setResultClosed] = useState(false);
  /**
   * Song time practice starts from after a click on the staff; null = the beginning.
   * Kept across reloads (listen, speed, hand, mode), cleared by "Сначала" and a new song.
   */
  const startFromRef = useRef<number | null>(null);
  const { sound, ensureSound } = useSound();
  const current = useSong(startFromRef);
  const course = useCourse(current.showSong);
  const reading = useReadingCourse();
  const intervals = useIntervalCourse();
  const practiceActive = reading.active || intervals.active;
  const ear = intervals.active && intervals.mode === "hear-and-choose";
  const practiceExercise = intervals.exercise ?? reading.exercise;
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
  const displayPrefs = useMemo(
    () =>
      practiceActive
        ? { ...readingDisplayProfile(staffPrefs), visible: !ear, keys: !ear }
        : game.performance
          ? {
              ...staffPrefs,
              visible: course.active
                ? course.saved.view === "staff" || course.saved.view === "both"
                : staffPrefs.visible,
              fingers: false,
              hands: false,
              labels: false,
              noteNames: "off" as const,
              chords: false
            }
          : course.active
            ? {
                ...staffPrefs,
                visible: course.saved.view === "staff" || course.saved.view === "both"
              }
            : staffPrefs,
    [practiceActive, ear, game.performance, staffPrefs, course.active, course.saved.view]
  );
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
    reading: practiceActive,
    pianoBlocked: ear,
    songKey: word.practiceKey,
    wordTyping: word.enabled,
    startFromRef,
    ensureSound,
    onNoteClick: current.cycleFinger,
    onTake: takes.recordTake,
    onRunFinished: intervals.active
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
    libraryOpen || settingsOpen || reading.intro
  );
  useIntervalAudioTrainer(
    intervals.audio,
    intervals.session,
    trainer.trainerRef,
    trainer.trainerReady,
    libraryOpen || settingsOpen || reading.intro,
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
  useWordTypingInterfaceLanguage(word, snapshot.playing);
  const computerKeyboard = useComputerKeyboard();
  const input = useKeyInput(
    trainer.trainerRef,
    ear
      ? { ...computerKeyboard.options, blocked: true }
      : word.enabled
        ? word.keyboardOptions
        : computerKeyboard.options,
    device.intercept,
    trainer.trainerReady,
    ear
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
    locked: game.ranked && snapshot.playing
  });
  useGameRuntime(trainer.trainerRef, trainer.trainerReady, {
    loop: !practiceActive && game.range.loop,
    ranked: !practiceActive && game.ranked,
    stopOnError: !practiceActive && game.stopOnError,
    rankedReady: timing.rankedReady,
    performance: !practiceActive && game.performance,
    canStart: !ear && (!word.enabled || (!word.pending && !word.error)),
    resumeWhenReady: word.enabled,
    deviceId: timing.profile?.deviceId ?? ""
  });
  const view = useFallingView({
    hostRef: trainer.hostRef,
    hasScore: Boolean(score.staffXml),
    viewRef: trainer.viewRef,
    trainerRef: trainer.trainerRef,
    trainerReady: trainer.trainerReady,
    song: word.practiceSong,
    baseSong: practiceActive || word.enabled ? word.practiceSong : current.baseSong,
    staffPrefs: workspacePrefs,
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

  const { listening } = trainer;
  const { review, lastTake, comparing } = takes;

  // The shell: one bar, the song's progress, windows for the library and the settings.
  const playing = snapshot.playing;

  const play = () => {
    setResultClosed(false);
    if (ear) intervals.audio.togglePause();
    else void trainer.togglePlay();
  };
  const startOver = () => {
    setResultClosed(false);
    if (intervals.active) intervals.newSeries();
    else if (reading.active) reading.newSeries();
    else trainer.restart();
  };
  useShortcuts({
    play,
    blocked: word.enabled
      ? libraryOpen || settingsOpen || word.pending || Boolean(word.error)
      : computerKeyboard.editing
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
  const keyboardSettings = useKeyboardSettings(view, staffPrefs, updateStaffPrefs, toggles);

  const chooseWordPart = (part: Part) => {
    startFromRef.current = null;
    word.choosePart(part);
  };
  const wordSettings = (
    <WordTypingSettings
      language={word.language}
      part={word.part}
      accompaniment={word.accompaniment}
      onAccompaniment={word.setAccompaniment}
      layout={word.layout}
      onLayout={(layout) => {
        word.update({ layout });
      }}
      onRegenerate={word.regenerate}
      locked={playing}
      pending={word.pending}
      onLanguage={(language) => {
        word.update({ language });
      }}
      onPart={chooseWordPart}
    />
  );

  const chooseGame = (enabled: boolean) => {
    if (practiceActive) reading.exit();
    computerKeyboard.endEditing();
    startFromRef.current = null;
    word.update({ enabled });
  };
  const timingStatus = <PracticeTimingStatus policy={snapshot.timingPolicy} ranked={game.ranked} />;
  const modeSwitch = (
    <GameModeSwitch wordTyping={word.enabled} locked={playing} onChange={chooseGame}>
      {word.enabled && wordSettings}
      {timingStatus}
    </GameModeSwitch>
  );

  return {
    reading,
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
    trainer,
    snapshot,
    computerKeyboard,
    input,
    fit,
    timing,
    view,
    library,
    listening,
    review: practiceActive ? null : review,
    lastTake,
    comparing: !practiceActive && comparing,
    playing: ear ? !intervals.audio.paused : playing,
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
