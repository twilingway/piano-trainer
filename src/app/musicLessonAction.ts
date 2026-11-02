import type { MusicCourseCommand, MusicCourseView } from "../ui/musicCourseTypes";

export interface LessonAction {
  readonly labelKey: string;
  readonly command: MusicCourseCommand | "stop" | null;
  readonly disabled: boolean;
  readonly reasonKey?: string | undefined;
}

export function musicButtonAnswer(view: MusicCourseView): boolean {
  if (!view.canAnswer) return false;
  if (view.taskKind === "position" || view.taskKind === "group") return true;
  return (
    ["playing", "reply"].includes(view.status) &&
    ["tone-semitone", "name-chord", "function", "auditory-interval"].includes(view.taskKind)
  );
}

/** Read the controller's gates; transport never substitutes another start path. */
export function musicLessonAction(view: MusicCourseView): LessonAction {
  const blocked = !view.ready || !!view.error;
  const reasonKey =
    view.error?.key ?? (!view.ready ? "Дождитесь готовности нот и звука." : undefined);
  if (view.status === "error")
    return {
      labelKey: view.retryCreatesNewMaterial ? "Новый пример для проверки" : "Повторить текущее",
      command: "retry",
      disabled: view.canRetry === false
    };
  if (view.status === "listening")
    return { labelKey: "Остановить попытку", command: "stop", disabled: false };
  if (view.status === "preview")
    return { labelKey: "Рассмотрите фразу", command: null, disabled: true };
  if (view.status === "completed" && view.course === "integrated")
    return { labelKey: "Повторить мини-урок", command: "retry", disabled: !view.allReleased };
  if (view.status === "result" || view.status === "completed")
    return {
      labelKey: view.canNext ? "Дальше" : "Новое задание",
      command: view.canNext ? "next" : "new",
      disabled: !view.allReleased,
      ...(!view.allReleased ? { reasonKey: "Отпустите все клавиши перед продолжением." } : {})
    };
  if (musicButtonAnswer(view))
    return { labelKey: "Выберите ответ под нотами", command: null, disabled: true };
  if (view.canFinish || (view.taskKind === "dictation" && view.status === "reply"))
    return {
      labelKey: "Завершить ответ",
      command: "finish",
      disabled: !view.canFinish || blocked || !view.allReleased,
      reasonKey: !view.allReleased ? "Отпустите все клавиши перед продолжением." : reasonKey
    };
  if (view.status === "playing" || view.status === "reply")
    return { labelKey: "Остановить попытку", command: "stop", disabled: false };
  if (view.canListen && !view.canStart)
    return { labelKey: "Послушать образец", command: "listen", disabled: blocked, reasonKey };
  return {
    labelKey: view.taskKind === "dictation" ? "Начать мой ответ" : "Начать задание",
    command: "start",
    disabled: !view.canStart || blocked || !view.allReleased,
    reasonKey: !view.allReleased ? "Отпустите все клавиши перед продолжением." : reasonKey
  };
}

export function dispatchMusicLessonAction(
  view: MusicCourseView,
  command: (value: MusicCourseCommand) => void,
  cancel: () => void
): void {
  const action = musicLessonAction(view);
  if (action.disabled || !action.command) return;
  if (action.command === "stop") cancel();
  else command(action.command);
}

export function lessonPlayback(
  windowOpen: boolean,
  musicOrEar: boolean,
  playPractice: () => void,
  playSong: () => void
): () => void {
  return () => {
    if (!windowOpen) (musicOrEar ? playPractice : playSong)();
  };
}

export function practiceLessonAction(options: {
  readonly music?: MusicCourseView | undefined;
  readonly completed?: LessonAction | undefined;
  readonly ear: boolean;
  readonly paused: boolean;
  readonly listening: boolean;
  readonly counting: boolean;
  readonly playing: boolean;
  readonly cancelsAttempt: boolean;
  readonly blocked: boolean;
}): LessonAction {
  if (options.completed) return options.completed;
  if (options.music) return musicLessonAction(options.music);
  return {
    labelKey: options.ear
      ? options.paused
        ? "Продолжить интервалы"
        : options.listening
          ? "Пауза интервалов"
          : "Послушать пару"
      : options.counting
        ? "Отменить отсчёт"
        : options.playing
          ? options.cancelsAttempt
            ? "Остановить попытку"
            : "Пауза"
          : "Играть",
    command: "start",
    disabled: options.blocked
  };
}

interface SeriesOwner {
  readonly active: boolean;
  readonly snapshot?: { readonly completed: boolean } | null | undefined;
  readonly newSeries: () => void;
}
interface RepeatedSeriesOwner {
  readonly active: boolean;
  readonly status: string;
  readonly onRepeat: () => void | Promise<void>;
}
export interface CompletedPracticeOwners {
  readonly reading: SeriesOwner;
  readonly intervals: SeriesOwner;
  readonly twoHand: SeriesOwner;
  readonly heldBass: SeriesOwner;
  readonly rhythm: RepeatedSeriesOwner;
  readonly independentRhythm: RepeatedSeriesOwner;
}

/** Completion changes the transport command, not the session's musical rules. */
export function completedPracticeTransport(
  owners: CompletedPracticeOwners,
  blocked: boolean
): {
  readonly action: LessonAction;
  readonly invoke: () => void;
} | null {
  const series = [owners.reading, owners.intervals, owners.twoHand, owners.heldBass].find(
    (owner) => owner.active && owner.snapshot?.completed
  );
  if (series)
    return {
      action: { labelKey: "Новая серия", command: "new", disabled: blocked },
      invoke: () => {
        if (!blocked) series.newSeries();
      }
    };
  const repeated = [owners.rhythm, owners.independentRhythm].find(
    (owner) => owner.active && owner.status === "completed"
  );
  if (repeated)
    return {
      action: { labelKey: "Повторить", command: "retry", disabled: blocked },
      invoke: () => {
        if (!blocked) void repeated.onRepeat();
      }
    };
  return null;
}

export function restartBasicPractice(owners: CompletedPracticeOwners, fallback: () => void): void {
  if (owners.independentRhythm.active) void owners.independentRhythm.onRepeat();
  else if (owners.heldBass.active) owners.heldBass.newSeries();
  else if (owners.twoHand.active) owners.twoHand.newSeries();
  else if (owners.rhythm.active) void owners.rhythm.onRepeat();
  else if (owners.intervals.active) owners.intervals.newSeries();
  else if (owners.reading.active) owners.reading.newSeries();
  else fallback();
}
