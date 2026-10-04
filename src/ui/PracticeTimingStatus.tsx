import type { TimingPolicy } from "../practice/timingPolicy";

interface Props {
  readonly policy: TimingPolicy | undefined;
  readonly ranked: boolean;
}

const STATUS: Readonly<
  Record<Exclude<TimingPolicy, "listening">, { label: string; hint: string }>
> = {
  learning: {
    label: "Учебный режим · +300 мс",
    hint: "Можно опоздать до 300 мс: поздняя нота даёт OK и 25 базовых очков. Изменить: Настройки → Игра."
  },
  strict: {
    label: "Строгий тайминг",
    hint: "Окна попадания зависят от сложности. Учебный допуск выключен. Изменить: Настройки → Игра."
  },
  waiting: {
    label: "Ожидание ноты",
    hint: "Песня ждёт нужную клавишу. Время реакции не оценивается."
  }
};

/** Always visible by the game selector, even when the score or notes are hidden. */
export function PracticeTimingStatus({ policy, ranked }: Props) {
  if (!policy || policy === "listening") return null;
  const rating = ranked && policy !== "waiting";
  const status = rating
    ? {
        label: "Рейтинг · строгий тайминг",
        hint: "Рейтинг использует строгие окна без учебного допуска."
      }
    : STATUS[policy];
  return (
    <span
      className="practice-timing-status"
      data-policy={rating ? "ranked" : policy}
      role="status"
      title={status.hint}
    >
      <span className="practice-timing-status__light" aria-hidden="true" />
      {status.label}
    </span>
  );
}
