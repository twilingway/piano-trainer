// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerRuntimeProvider, type PlayerRuntime } from "./PlayerRuntimeProvider";
import { ConnectedPlayerHeader } from "./ConnectedPlayerHeader";
import { ConnectedPlayerWindows } from "./ConnectedPlayerWindows";
import { ConnectedPracticeWorkspace } from "./ConnectedPracticeWorkspace";
import { ConnectedNotices } from "./ConnectedPlayerNotices";
import { emptyMusicState } from "./musicPersistence";
import { musicCourseMessages } from "../i18n/musicCourseMessages";
import { createAppStore } from "./store";
import { progressKey, type CourseLesson } from "../course/model";
import type { Locale } from "../i18n/locales";
import { translate } from "../i18n/translate";
import { readingMessages } from "../i18n/readingMessages";
import { bassReadingMessages } from "../i18n/bassReadingMessages";
import { twoHandMessages } from "../i18n/twoHandMessages";
import { heldBassMessages } from "../i18n/heldBassMessages";
import { independentRhythmMessages } from "../i18n/independentRhythmMessages";
let activeLocale: Locale = "ru";
const observed = vi.hoisted(() => ({
  header: vi.fn(),
  progress: vi.fn(),
  settings: vi.fn(),
  result: vi.fn(),
  library: vi.fn(),
  workspace: vi.fn(),
  runtime: {} as PlayerRuntime
}));
vi.mock("./usePlayerRuntime", () => ({ usePlayerRuntime: () => observed.runtime }));
vi.mock("./useI18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      translate(
        activeLocale,
        {
          ...musicCourseMessages,
          ...readingMessages,
          ...bassReadingMessages,
          ...twoHandMessages,
          ...heldBassMessages,
          ...independentRhythmMessages
        },
        key
      )
  })
}));
vi.mock("./ConnectedSettings", () => ({
  ConnectedPlayerSettings: observed.settings,
  ConnectedResultDialog: observed.result
}));
vi.mock("./ConnectedPlayback", () => ({
  ConnectedPlayerTopBar: observed.header,
  ConnectedSongProgress: observed.progress,
  ConnectedWorkspace: observed.workspace,
  ConnectedGameBoard: () => null,
  ConnectedWordBoard: () => null,
  ConnectedWordTicker: () => null
}));
vi.mock("../ui/GameModeSwitch", () => ({ GameModeSegment: () => null }));
vi.mock("../ui/WordTextPopover", () => ({ WordTextPopover: () => null }));
vi.mock("../ui/WordTypingBoard", () => ({ WordQuality: () => null }));
vi.mock("../ui/LibraryDialog", () => ({ LibraryDialog: observed.library }));
const initial = (): PlayerRuntime =>
  ({
    libraryOpen: false,
    settingsOpen: false,
    resultClosed: false,
    listening: false,
    comparing: false,
    snapshot: { finished: false },
    trainer: { snapshotSource: {}, mode: "wait", speed: 1, playChoice: { hands: "both" } },
    takes: { canReview: false },
    reading: { active: false, task: null },
    intervals: { active: false, mode: "see-and-play" },
    rhythm: { active: false },
    twoHand: {
      active: false,
      intro: false,
      history: [],
      sourceFilter: "all",
      setSourceFilter: vi.fn(),
      start: vi.fn(),
      setIntro: vi.fn()
    },
    heldBass: {
      active: false,
      intro: false,
      history: [],
      sourceFilter: "all",
      setSourceFilter: vi.fn(),
      start: vi.fn(),
      setIntro: vi.fn()
    },
    independentRhythm: {
      active: false,
      intro: false,
      history: [],
      sourceFilter: "all",
      setSourceFilter: vi.fn(),
      start: vi.fn(),
      setIntro: vi.fn(),
      phase: "pulse",
      status: "preparation",
      ready: false,
      allReleased: true,
      source: "keyboard",
      midiAvailable: false,
      midiChannel: null,
      showKeyHints: false,
      countInBeat: undefined,
      error: null,
      result: null,
      pulseSummary: null,
      setSource: vi.fn(),
      setShowKeyHints: vi.fn(),
      onStart: vi.fn(),
      onRepeat: vi.fn(),
      newSeries: vi.fn(),
      exit: vi.fn(),
      onGoToRhythm: vi.fn(),
      onRetryStaff: vi.fn(),
      prompt: { musicXml: "independent-rhythm-score", beat: undefined },
      presentation: {
        id: "independent-rhythm-presentation",
        onPresented: vi.fn(),
        onError: vi.fn()
      },
      retry: 0
    },
    music: {
      active: false,
      scene: null,
      exercise: null,
      ready: false,
      source: "keyboard",
      view: {
        course: "sight-reading",
        status: "preparation",
        taskKind: "sight-reading",
        ready: false,
        allReleased: true,
        canStart: false,
        canListen: false,
        canFinish: false,
        canNext: false,
        canHelp: false,
        showHelp: false
      },
      options: undefined,
      staffXml: undefined,
      staffVisible: false,
      fingeringVisible: false,
      keysVisible: true,
      policy: null,
      presentation: undefined,
      retry: 0,
      preferences: emptyMusicState(),
      history: [],
      integrated: null,
      progressOpen: false,
      setProgressOpen: vi.fn(),
      courseFilter: "all",
      setCourseFilter: vi.fn(),
      purposeFilter: "all",
      setPurposeFilter: vi.fn(),
      command: vi.fn(),
      choose: vi.fn(),
      setPreferences: vi.fn(),
      open: vi.fn(),
      cancel: vi.fn(),
      refreshConnection: vi.fn()
    } satisfies PlayerRuntime["music"],
    practiceActive: false,
    course: { active: null, saved: { progress: {} }, controller: { open: vi.fn() } },
    fullscreen: { error: null, active: false },
    word: { storageError: null, enabled: false, pending: false, practiceSong: { title: "A" } },
    song: { title: "A" },
    current: {
      lesson: null,
      arrangement: {
        simplified: true,
        asWritten: true,
        onSimplified: vi.fn(),
        onAsWritten: vi.fn()
      }
    },
    screen: { editing: false },
    view: { mirrorHostRef: { current: null } },
    score: {},
    input: {},
    playing: false,
    sound: "idle",
    play: vi.fn(),
    game: { ranked: false },
    timing: { rankedReady: true },
    library: { loadError: null },
    setLibraryOpen: vi.fn(),
    setSettingsOpen: vi.fn(),
    setResultClosed: vi.fn(),
    computerKeyboard: { endEditing: vi.fn(), bindings: {} },
    startOver: vi.fn()
  }) as unknown as PlayerRuntime;
let cleanup = () => undefined;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  activeLocale = "ru";
});
function mount(children: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const store = createAppStore({ storage: { getItem: () => null, setItem: vi.fn() } });
  const render = () => {
    act(() => {
      root.render(
        <Provider store={store}>
          <PlayerRuntimeProvider>{children}</PlayerRuntimeProvider>
        </Provider>
      );
    });
  };
  cleanup = () => {
    act(() => {
      root.unmount();
    });
  };
  render();
  return { container, render };
}
describe("connected regions without React Compiler", () => {
  describe.each(["ru", "en"] as const)("music header in %s", (locale) => {
    it.each([
      ["sight-reading", "Чтение с листа", "Sight-reading"],
      ["harmony", "Гармония", "Harmony"],
      ["dictation", "Диктанты", "Dictation"],
      ["integrated", "Мини-уроки", "Mini-lessons"]
    ] as const)(
      "labels the active %s course in the selected interface language",
      (course, ru, en) => {
        activeLocale = locale;
        observed.runtime = initial();
        observed.runtime = {
          ...observed.runtime,
          song: { ...observed.runtime.song, title: "" },
          music: {
            ...observed.runtime.music,
            active: true,
            view: { ...observed.runtime.music.view, course }
          },
          practiceActive: true
        };
        mount(<ConnectedPlayerHeader />);
        expect(observed.header.mock.lastCall?.[0]).toMatchObject({
          title: locale === "ru" ? ru : en,
          fixedPractice: true
        });
        expect(observed.progress).not.toHaveBeenCalled();
      }
    );
  });
  it("ignores music frame updates but follows course changes and exit in the header", () => {
    observed.runtime = initial();
    observed.runtime = {
      ...observed.runtime,
      music: { ...observed.runtime.music, active: true },
      practiceActive: true
    };
    const view = mount(<ConnectedPlayerHeader />);
    const renders = observed.header.mock.calls.length;
    observed.runtime = {
      ...observed.runtime,
      snapshot: { ...observed.runtime.snapshot, waiting: true },
      music: {
        ...observed.runtime.music,
        view: { ...observed.runtime.music.view, status: "playing", canStart: false }
      }
    };
    view.render();
    expect(observed.header.mock.calls.length).toBe(renders);
    observed.runtime = {
      ...observed.runtime,
      music: {
        ...observed.runtime.music,
        view: { ...observed.runtime.music.view, course: "dictation" }
      }
    };
    view.render();
    expect(observed.header.mock.lastCall?.[0]).toMatchObject({ title: "Диктанты" });
    observed.runtime = {
      ...observed.runtime,
      music: { ...observed.runtime.music, active: false },
      practiceActive: false
    };
    view.render();
    expect(observed.header.mock.lastCall?.[0]).toMatchObject({ title: "A", fixedPractice: false });
  });
  it.each(["ru", "en"] as const)(
    "labels the independent rhythm course with fixed tempo controls in %s",
    (locale) => {
      activeLocale = locale;
      observed.runtime = initial();
      observed.runtime.independentRhythm = { ...observed.runtime.independentRhythm, active: true };
      observed.runtime.practiceActive = true;
      observed.runtime.trainer = { ...observed.runtime.trainer, mode: "tempo" };
      mount(<ConnectedPlayerHeader />);
      expect(observed.header.mock.lastCall?.[0]).toMatchObject({
        title: locale === "ru" ? "Играю два ритма" : "Play two rhythms",
        hands: "both",
        fixedPractice: true,
        mode: "tempo",
        speed: 1
      });
      expect(observed.progress).not.toHaveBeenCalled();
    }
  );
  it("uses the independent rhythm presentation and suppresses ordinary result and game UI", () => {
    observed.runtime = initial();
    observed.runtime.independentRhythm = { ...observed.runtime.independentRhythm, active: true };
    observed.runtime.practiceActive = true;
    observed.runtime.trainer = { ...observed.runtime.trainer, mode: "tempo" };
    observed.runtime.snapshot = { ...observed.runtime.snapshot, finished: true };
    mount(
      <>
        <ConnectedPlayerHeader />
        <ConnectedPracticeWorkspace />
        <ConnectedPlayerWindows />
      </>
    );
    const header = observed.header.mock.lastCall?.[0] as {
      game?: unknown;
      course?: unknown;
      difficulty?: unknown;
    };
    expect(header.game).toBeUndefined();
    expect(header.course).toBeUndefined();
    expect(header.difficulty).toBeUndefined();
    expect(observed.result.mock.lastCall?.[0]).toMatchObject({ open: false });
    expect(observed.workspace.mock.lastCall?.[0]).toMatchObject({
      staffXml: "independent-rhythm-score",
      staffPresentation: observed.runtime.independentRhythm.presentation,
      staffRetry: 0,
      readingBeat: undefined,
      gameBoard: false,
      editing: false,
      reviewMarks: undefined,
      transcription: undefined
    });
  });
  it.each(["ru", "en"] as const)("labels the held bass course in %s", (locale) => {
    activeLocale = locale;
    observed.runtime = initial();
    observed.runtime.heldBass = { ...observed.runtime.heldBass, active: true };
    observed.runtime.practiceActive = true;
    mount(<ConnectedPlayerHeader />);
    expect(observed.header.mock.lastCall?.[0]).toMatchObject({
      title: locale === "ru" ? "Держу бас, играю мелодию" : "Hold the bass, play the melody",
      hands: "both",
      fixedPractice: true,
      mode: "wait",
      speed: 1
    });
  });
  it.each(["ru", "en"] as const)("labels the two-hand course in %s", (locale) => {
    activeLocale = locale;
    observed.runtime = initial();
    observed.runtime.twoHand = { ...observed.runtime.twoHand, active: true };
    observed.runtime.practiceActive = true;
    mount(<ConnectedPlayerHeader />);
    expect(observed.header.mock.lastCall?.[0]).toMatchObject({
      title: locale === "ru" ? "Две руки: играю вместе" : "Two hands: play together",
      hands: "both",
      fixedPractice: true
    });
  });
  it.each([
    ["ru", "notes", "Левая рука: отдельные ноты", "Читаю пять нот · Читаю отдельные ноты"],
    ["ru", "phrases", "Левая рука: короткие фразы", "Читаю пять нот · Читаю короткие фразы"],
    ["en", "notes", "Left hand: single notes", "Read five notes · Read single notes"],
    ["en", "phrases", "Left hand: short phrases", "Read five notes · Read short phrases"]
  ] as const)(
    "uses the %s bass %s title and updates on an isBass-only change",
    (locale, task, bassTitle, trebleTitle) => {
      activeLocale = locale;
      observed.runtime = initial();
      observed.runtime = {
        ...observed.runtime,
        reading: { ...observed.runtime.reading, active: true, isBass: true, task },
        practiceActive: true,
        trainer: {
          ...observed.runtime.trainer,
          playChoice: { ...observed.runtime.trainer.playChoice, hands: "left" }
        }
      };
      const view = mount(<ConnectedPlayerHeader />);
      expect(observed.header.mock.lastCall?.[0]).toMatchObject({
        title: bassTitle,
        hands: "left",
        fixedPractice: true,
        mode: "wait",
        speed: 1
      });
      const renders = observed.header.mock.calls.length;
      observed.runtime = {
        ...observed.runtime,
        reading: { ...observed.runtime.reading, isBass: false }
      };
      view.render();
      expect(observed.header.mock.calls.length).toBe(renders + 1);
      expect(observed.header.mock.lastCall?.[0]).toMatchObject({
        title: trebleTitle,
        hands: "left",
        fixedPractice: true
      });
    }
  );
  it("offers the credited course task in the result modal and waits for the next click", () => {
    const lesson: CourseLesson = {
      id: "synthetic",
      number: 1,
      title: "Synthetic",
      goal: "Synthetic",
      stages: ["right", "both"],
      phrases: [{ id: "first", version: "1", musicXml: "synthetic" }]
    };
    const phrase = lesson.phrases[0];
    if (!phrase) throw new Error("Missing fixture phrase");
    const selection = { lessonId: lesson.id, stage: "right" as const, phraseId: phrase.id };
    const open = vi.fn();
    observed.runtime = initial();
    observed.runtime.course = {
      ...observed.runtime.course,
      active: { lesson, phrase, selection },
      saved: {
        ...observed.runtime.course.saved,
        progress: { [progressKey(lesson, "right", phrase)]: true }
      },
      controller: { ...observed.runtime.course.controller, open }
    };
    observed.runtime.snapshot = { ...observed.runtime.snapshot, finished: true };
    mount(<ConnectedPlayerWindows />);
    expect(open).not.toHaveBeenCalled();
    const props = observed.result.mock.lastCall?.[0] as { onNext: () => void };
    props.onNext();
    expect(open).toHaveBeenCalledWith({ ...selection, stage: "both" });
    expect(observed.runtime.setResultClosed).toHaveBeenCalledWith(true);
  });
  it("does not render closed windows or subscribe to their catalog after unrelated owner updates", () => {
    observed.runtime = initial();
    const view = mount(<ConnectedPlayerWindows />);
    const renders = observed.settings.mock.calls.length;
    observed.runtime = {
      ...observed.runtime,
      library: { ...observed.runtime.library, mySongs: [] },
      trainer: { ...observed.runtime.trainer, speed: 2 },
      takes: { ...observed.runtime.takes }
    };
    view.render();
    expect(observed.settings.mock.calls.length).toBe(renders);
    expect(observed.library).not.toHaveBeenCalled();
    observed.runtime = { ...observed.runtime, settingsOpen: true };
    view.render();
    expect(observed.settings.mock.calls.length).toBe(renders + 1);
  });
  it("keeps the header stable across fresh command objects and invokes the latest committed play command", () => {
    observed.runtime = initial();
    const view = mount(<ConnectedPlayerHeader />);
    const renders = observed.header.mock.calls.length;
    const play = vi.fn();
    observed.runtime = {
      ...observed.runtime,
      play,
      snapshot: { ...observed.runtime.snapshot, waiting: true },
      current: {
        ...observed.runtime.current,
        arrangement: {
          simplified: true,
          asWritten: true,
          onSimplified: vi.fn(),
          onAsWritten: vi.fn()
        }
      },
      trainer: {
        ...observed.runtime.trainer,
        playChoice: { ...observed.runtime.trainer.playChoice, onHands: vi.fn() }
      }
    };
    view.render();
    expect(observed.header.mock.calls.length).toBe(renders);
    const props = observed.header.mock.lastCall?.[0] as { onTogglePlay: () => void };
    props.onTogglePlay();
    expect(play).toHaveBeenCalledOnce();
    observed.runtime = { ...observed.runtime, playing: true };
    view.render();
    expect(observed.header.mock.calls.length).toBe(renders + 1);
  });
  it("updates notices only for displayed error fields", () => {
    observed.runtime = initial();
    const view = mount(<ConnectedNotices />);
    expect(view.container.textContent).toBe("");
    observed.runtime = {
      ...observed.runtime,
      word: { ...observed.runtime.word, pending: true },
      library: { ...observed.runtime.library, loadError: "failure" }
    };
    view.render();
    expect(view.container.textContent).toBe("failure");
    observed.runtime = {
      ...observed.runtime,
      library: { ...observed.runtime.library, loadError: null }
    };
    view.render();
    expect(view.container.textContent).toBe("");
  });
  it("uses fixed reading controls and suppresses previous course, game and result UI", () => {
    const lesson: CourseLesson = {
      id: "previous-course",
      number: 1,
      title: "Previous course",
      goal: "Synthetic",
      stages: ["right"],
      phrases: [{ id: "first", version: "1", musicXml: "synthetic" }]
    };
    const phrase = lesson.phrases[0];
    if (!phrase) throw new Error("Missing fixture phrase");
    observed.runtime = initial();
    observed.runtime = {
      ...observed.runtime,
      reading: { ...observed.runtime.reading, active: true, task: "check" },
      practiceActive: true,
      trainer: {
        ...observed.runtime.trainer,
        playChoice: { ...observed.runtime.trainer.playChoice, hands: "right" }
      },
      snapshot: { ...observed.runtime.snapshot, finished: true },
      course: {
        ...observed.runtime.course,
        active: {
          lesson,
          phrase,
          selection: { lessonId: lesson.id, stage: "right", phraseId: phrase.id }
        }
      },
      game: { ...observed.runtime.game, ranked: true },
      timing: { ...observed.runtime.timing, rankedReady: false },
      modeSwitch: <div>Previous game mode</div>
    };
    const view = mount(
      <>
        <ConnectedPlayerHeader />
        <ConnectedPlayerWindows />
        <ConnectedNotices />
      </>
    );
    const props = observed.header.mock.lastCall?.[0] as {
      title: string;
      fixedPractice: boolean;
      mode: string;
      hands: string;
      speed: number;
      difficulty: unknown;
      game: unknown;
      course: unknown;
    };
    expect(props.title).toBe("Читаю пять нот · Проверяю чтение без подсказок");
    expect(props.fixedPractice).toBe(true);
    expect([props.mode, props.hands, props.speed]).toEqual(["wait", "right", 1]);
    expect(props.difficulty).toBeUndefined();
    expect(props.game).toBeUndefined();
    expect(props.course).toBeUndefined();
    expect(observed.progress).not.toHaveBeenCalled();
    expect(view.container.textContent).toBe("");
    expect(observed.result.mock.lastCall?.[0]).toMatchObject({ open: false });

    observed.runtime = {
      ...observed.runtime,
      reading: { ...observed.runtime.reading, active: false, task: null },
      practiceActive: false
    };
    view.render();
    expect(observed.header.mock.lastCall?.[0]).toMatchObject({ fixedPractice: false });
    expect(observed.progress).toHaveBeenCalledOnce();
    expect(view.container.textContent).toContain("Previous game mode");
    expect(view.container.textContent).toContain("Рейтинг недоступен");
    expect(observed.result.mock.lastCall?.[0]).toMatchObject({ open: true });
  });
});
