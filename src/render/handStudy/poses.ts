export type StudyFinger = 1 | 2 | 3 | 4 | 5;
export interface StudyPose {
  readonly id: string;
  readonly label: string;
  readonly down: readonly StudyFinger[];
  readonly reach: number;
  readonly black?: readonly StudyFinger[];
  readonly tucked?: boolean;
}

const fingers: readonly StudyFinger[] = [1, 2, 3, 4, 5];
const labels = [
  "Одна нота · палец {fingers}",
  "Две ноты · пальцы {fingers}",
  "Три ноты · пальцы {fingers}",
  "Четыре ноты · пальцы {fingers}",
  "Пять нот · пальцы {fingers}"
];

const combinations: StudyPose[] = Array.from({ length: 31 }, (_, i) => {
  const down = fingers.filter((finger) => ((i + 1) & (1 << (finger - 1))) !== 0);
  return { id: `fingers-${String(i + 1)}`, label: labels[down.length - 1] ?? "", down, reach: 4 };
}).sort((a, b) => a.down.length - b.down.length || a.id.localeCompare(b.id));

export const STUDY_POSES: readonly StudyPose[] = [
  { id: "relaxed", label: "Спокойная кисть", down: [], reach: 4 },
  ...combinations,
  { id: "third", label: "Терция · 1–3", down: [1, 3], reach: 4 },
  { id: "fifth", label: "Квинта · 1–5", down: [1, 5], reach: 4 },
  { id: "sixth", label: "Секста · 1–5", down: [1, 5], reach: 5 },
  { id: "seventh", label: "Септима · 1–5", down: [1, 5], reach: 6 },
  { id: "octave", label: "Октава · 1–5", down: [1, 5], reach: 7 },
  { id: "triad", label: "Трезвучие · 1–3–5", down: [1, 3, 5], reach: 4 },
  { id: "inversion", label: "Обращение · 1–2–5", down: [1, 2, 5], reach: 4 },
  { id: "chord7", label: "Септаккорд · 1–2–3–5", down: [1, 2, 3, 5], reach: 6 },
  { id: "black", label: "Аккорд с чёрной клавишей", down: [1, 3, 5], reach: 4, black: [3] },
  { id: "tucked", label: "Подложенный большой палец", down: [1], reach: 4, tucked: true }
];
