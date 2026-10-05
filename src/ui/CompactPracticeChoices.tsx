import { useI18n } from "../app/useI18n";
import { HandIcon, ListenIcon } from "./icons";
import type { HandsChoice, PracticeModeChoice } from "./PlayerTopBar";

export const HAND_CHOICES = [
  { value: "left", label: "Левая", title: "Левая рука", hint: "Правую руку играет программа." },
  { value: "right", label: "Правая", title: "Правая рука", hint: "Левую руку играет программа." },
  { value: "both", label: "Обе", title: "Обе руки", hint: "Играйте обе партии самостоятельно." },
  {
    value: "listen",
    label: "Слушать",
    title: "Только слушать",
    hint: "Нажмите ▶ — программа сыграет всю мелодию."
  }
] as const;

/** The same hand silhouette identifies the selected party and its menu choice. */
export function HandsPicture({ hands }: { readonly hands: HandsChoice }) {
  const { t } = useI18n();
  return (
    <span className="hands-picture" data-hands={hands} aria-hidden="true">
      {hands === "listen" ? <ListenIcon /> : <HandIcon />}
      {hands === "both" && <HandIcon />}
      {(hands === "left" || hands === "right") && (
        <small>{hands === "left" ? t("Л") : t("П")}</small>
      )}
    </span>
  );
}

interface Props {
  readonly hands: HandsChoice;
  readonly mode: PracticeModeChoice;
  readonly onHands: (hands: HandsChoice) => void;
  readonly onMode: (mode: PracticeModeChoice) => void;
}

/** The practice choices stay visible in the compact menu, with captions for touch. */
export function CompactPracticeChoices({ hands, mode, onHands, onMode }: Props) {
  const { t } = useI18n();
  return (
    <div className="compact-practice">
      <span className="compact-practice__heading">
        {hands === "listen" ? t("Режим: прослушивание") : t("Режим")}
      </span>
      <div className="segmented" role="radiogroup" aria-label={t("Режим игры")}>
        {(
          [
            ["wait", t("Ждать ноту"), t("Игра ждёт правильную клавишу.")],
            ["tempo", t("В темпе"), t("Игра идёт без остановок в выбранном темпе.")]
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            title={hint}
            aria-checked={hands !== "listen" && mode === value}
            disabled={hands === "listen"}
            onClick={() => {
              onMode(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="compact-practice__heading">{t("Как играть")}</span>
      <div className="compact-practice__hands" role="radiogroup" aria-label={t("Что играть")}>
        {HAND_CHOICES.map(({ value, label, title, hint }) => (
          <button
            key={value}
            type="button"
            className="view-toggle compact-practice__choice"
            role="radio"
            aria-checked={hands === value}
            aria-label={t(title)}
            title={`${t(title)}. ${t(hint)}`}
            onClick={() => {
              onHands(value);
            }}
          >
            <HandsPicture hands={value} />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
      <p className="compact-practice__hint">
        {t(HAND_CHOICES.find((choice) => choice.value === hands)?.hint ?? "")}
      </p>
    </div>
  );
}
