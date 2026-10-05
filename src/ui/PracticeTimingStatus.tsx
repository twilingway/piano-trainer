import { useI18n } from "../app/useI18n";
import type { TimingPolicy } from "../practice/timingPolicy";

interface Props {
  readonly policy: TimingPolicy | undefined;
  readonly ranked: boolean;
}

const STATUS: Readonly<
  Record<Exclude<TimingPolicy, "listening">, { label: string; short: string; hint: string }>
> = {
  learning: {
    label: "Учебный режим · +300 мс",
    short: "+300 мс",
    hint: "Можно опоздать до 300 мс: поздняя нота даёт OK и 25 базовых очков. Изменить: Настройки → Игра."
  },
  strict: {
    label: "Строгий тайминг",
    short: "Строгий",
    hint: "Окна попадания зависят от сложности. Учебный допуск выключен. Изменить: Настройки → Игра."
  },
  waiting: {
    label: "Ожидание ноты · без рейтинга",
    short: "Ожидание",
    hint: "Песня ждёт нужную клавишу. Время реакции не оценивается, рейтинга нет."
  }
};

/** Always visible in the bar or by the game selector, even when the score or notes are hidden. */
export function PracticeTimingStatus({ policy, ranked }: Props) {
  const { t } = useI18n();
  if (!policy || policy === "listening") return null;
  const rating = ranked && policy !== "waiting";
  const status = rating
    ? {
        label: t("Рейтинг · строгий тайминг"),
        short: t("Рейтинг"),
        hint: t("Рейтинг использует строгие окна без учебного допуска.")
      }
    : STATUS[policy];
  return (
    <span
      className="practice-timing-status"
      data-policy={rating ? "ranked" : policy}
      role="status"
      title={`${t(status.label)}. ${t(status.hint)}`}
    >
      <span className="practice-timing-status__light" aria-hidden="true" />
      <span className="practice-timing-status__label">{t(status.label)}</span>
      {/* A narrow bar shows this one; the tooltip keeps the whole label. */}
      <span className="practice-timing-status__short" aria-hidden="true">
        {t(status.short)}
      </span>
    </span>
  );
}
