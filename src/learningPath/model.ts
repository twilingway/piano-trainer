import { BEGINNER_STAGES } from "../beginner/catalog";
import type { MusicCourse } from "../musicLearning/types";
import type { ReadingTask } from "../reading/types";
export type PathCommand =
  | { readonly kind: "beginner"; readonly stageId: string }
  | { readonly kind: "intro"; readonly hand: "right" | "left" }
  | { readonly kind: "reading"; readonly task: ReadingTask }
  | { readonly kind: "bass"; readonly task: "notes" | "phrases" }
  | { readonly kind: "interval"; readonly mode: "see-and-play" | "hear-and-choose" }
  | { readonly kind: "rhythm" }
  | { readonly kind: "two-hand" }
  | { readonly kind: "held-bass" }
  | { readonly kind: "two-rhythms" }
  | { readonly kind: "music"; readonly course: MusicCourse };
export interface PathStep {
  readonly id: string;
  readonly chapter: string;
  readonly title: string;
  readonly goal: string;
  readonly symbol: string;
  readonly command: PathCommand;
}
export const PATH_STEPS: readonly PathStep[] = [
  ...BEGINNER_STAGES.map((stage): PathStep => ({
    id: stage.id,
    chapter:
      stage.hand === "right"
        ? "От одной ноты к октаве: правая рука"
        : "От одной ноты к октаве: левая рука",
    title: stage.title,
    goal: "Знакомство, короткая игра с помощником и самостоятельная попытка.",
    symbol: "♪",
    command: { kind: "beginner", stageId: stage.id }
  })),
  {
    id: "right-intro",
    chapter: "Знакомимся с пианино",
    title: "Найдём первую ноту",
    goal: "Найдите до и познакомьтесь с пятью клавишами правой руки.",
    symbol: "♩",
    command: {
      kind: "intro",
      hand: "right"
    }
  },
  {
    id: "right-notes",
    chapter: "Знакомимся с пианино",
    title: "Пять нот правой рукой",
    goal: "Увидьте одну ноту и найдите её на клавиатуре.",
    symbol: "♪",
    command: {
      kind: "reading",
      task: "notes"
    }
  },
  {
    id: "right-phrases",
    chapter: "Знакомимся с пианино",
    title: "Первая короткая фраза",
    goal: "Прочитайте несколько нот подряд правой рукой.",
    symbol: "♫",
    command: {
      kind: "reading",
      task: "phrases"
    }
  },
  {
    id: "right-check",
    chapter: "Знакомимся с пианино",
    title: "Теперь без подсказок",
    goal: "Проверьте чтение пяти нот на новой последовательности.",
    symbol: "★",
    command: {
      kind: "reading",
      task: "check"
    }
  },
  {
    id: "left-intro",
    chapter: "Подключаем левую руку",
    title: "Ноты для левой руки",
    goal: "Разберитесь, где до–соль в басовом ключе.",
    symbol: "♩",
    command: {
      kind: "intro",
      hand: "left"
    }
  },
  {
    id: "left-notes",
    chapter: "Подключаем левую руку",
    title: "Пять нот левой рукой",
    goal: "Найдите на клавиатуре ноты басового ключа.",
    symbol: "♪",
    command: {
      kind: "bass",
      task: "notes"
    }
  },
  {
    id: "left-phrases",
    chapter: "Подключаем левую руку",
    title: "Мелодия в левой руке",
    goal: "Соедините знакомые ноты в короткие фразы.",
    symbol: "♫",
    command: {
      kind: "bass",
      task: "phrases"
    }
  },
  {
    id: "interval-see",
    chapter: "Слышим и чувствуем музыку",
    title: "Расстояние между нотами",
    goal: "Увидьте и сыграйте пару нот: рядом или через одну.",
    symbol: "↗",
    command: {
      kind: "interval",
      mode: "see-and-play"
    }
  },
  {
    id: "interval-hear",
    chapter: "Слышим и чувствуем музыку",
    title: "Узнайте интервал на слух",
    goal: "Послушайте две ноты и выберите, как движется мелодия.",
    symbol: "♬",
    command: {
      kind: "interval",
      mode: "hear-and-choose"
    }
  },
  {
    id: "rhythm",
    chapter: "Слышим и чувствуем музыку",
    title: "Поймайте ритм",
    goal: "Отбивайте простой ритм. Можно начать без пианино.",
    symbol: "♩",
    command: {
      kind: "rhythm"
    }
  },
  {
    id: "two-hand",
    chapter: "Играем двумя руками",
    title: "Две руки вместе",
    goal: "Нажмите две ноты одновременно, левой и правой рукой.",
    symbol: "♫",
    command: {
      kind: "two-hand"
    }
  },
  {
    id: "held-bass",
    chapter: "Играем двумя руками",
    title: "Бас и мелодия",
    goal: "Удерживайте бас, пока правая рука играет мелодию.",
    symbol: "♭",
    command: {
      kind: "held-bass"
    }
  },
  {
    id: "two-rhythms",
    chapter: "Играем двумя руками",
    title: "У каждой руки свой ритм",
    goal: "Сохраните общий пульс с разными ритмами двух рук.",
    symbol: "♬",
    command: {
      kind: "two-rhythms"
    }
  },
  {
    id: "sight-reading",
    chapter: "Открываем новые темы",
    title: "Чтение новой мелодии",
    goal: "Выберите задание на чтение с листа и сыграйте новую фразу.",
    symbol: "♫",
    command: {
      kind: "music",
      course: "sight-reading"
    }
  },
  {
    id: "harmony",
    chapter: "Открываем новые темы",
    title: "Знакомство с гармонией",
    goal: "Выберите задание на аккорды и их звучание.",
    symbol: "♯",
    command: {
      kind: "music",
      course: "harmony"
    }
  },
  {
    id: "dictation",
    chapter: "Открываем новые темы",
    title: "Запишите то, что слышите",
    goal: "Выберите музыкальный диктант и восстановите мелодию.",
    symbol: "♪",
    command: {
      kind: "music",
      course: "dictation"
    }
  },
  {
    id: "integrated",
    chapter: "Открываем новые темы",
    title: "Соберём всё в мини-уроке",
    goal: "Соедините чтение, слух, ритм и игру в одном занятии.",
    symbol: "★",
    command: {
      kind: "music",
      course: "integrated"
    }
  }
];
const STEP_IDS = new Set(PATH_STEPS.map((step) => step.id));
export const isPathStepId = (id: unknown): id is string =>
  typeof id === "string" && STEP_IDS.has(id);
/** Finished activity is evidence of completion, never mastery or an access rule. */
export function lessonPath(completed: readonly string[]) {
  const done = new Set(completed);
  const next = PATH_STEPS.find((step) => !done.has(step.id)) ?? null;
  return {
    next,
    completedCount: PATH_STEPS.filter((step) => done.has(step.id)).length,
    steps: PATH_STEPS.map((step) => ({
      ...step,
      status: done.has(step.id)
        ? ("completed" as const)
        : next?.id === step.id
          ? ("current" as const)
          : ("available" as const)
    }))
  };
}
