import { useI18n } from "../app/useI18n";
import { ROLE_HAND, ROLE_TITLE } from "../song/midiParts";
import type { PartRole } from "../song/midiParts";
import { HandIcon, ListenIcon } from "./icons";
import type { HandsChoice, PracticeModeChoice } from "./PlayerTopBar";

export const HAND_CHOICES = [
  { value: "left", label: "Левая", title: "Левая рука", hint: "Правую руку играет программа." },
  { value: "right", label: "Правая", title: "Правая рука", hint: "Левую руку играет программа." },
  { value: "both", label: "Обе", title: "Обе руки", hint: "Обе руки играете вы." },
  {
    value: "listen",
    label: "Слушать",
    title: "Только слушать",
    hint: "Нажмите ▶ — программа сыграет всю мелодию."
  }
] as const;

/** A song's parts to play alone, and whether the program plays the rest. */
export interface PartsChoice {
  /** Empty when the song's parts are just its two hands. */
  readonly roles: readonly PartRole[];
  readonly role: PartRole | null;
  readonly onRole: (role: PartRole) => void;
  readonly accompaniment: boolean;
  readonly onAccompaniment: (on: boolean) => void;
}

/** Who plays, as the hand selects hold it: a hand choice, or `part:<role>`. */
export function choiceValue(hands: HandsChoice, parts: PartsChoice | undefined): string {
  return parts?.role ? `part:${parts.role}` : hands;
}

export function chooseValue(
  value: string,
  onHands: (hands: HandsChoice) => void,
  parts: PartsChoice | undefined
): void {
  if (value.startsWith("part:")) parts?.onRole(value.slice("part:".length) as PartRole);
  else onHands(value as HandsChoice);
}

/** The song's parts as options of a hand select. */
export function PartOptions({ parts }: { readonly parts: PartsChoice | undefined }) {
  const { t } = useI18n();
  if (!parts || parts.roles.length === 0) return null;
  return (
    <optgroup label={t("Партии")}>
      {parts.roles.map((role) => (
        <option key={role} value={`part:${role}`}>
          {t(ROLE_TITLE[role])}
        </option>
      ))}
    </optgroup>
  );
}

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
  readonly parts?: PartsChoice | undefined;
}

/** The practice choices stay visible in the compact menu, with captions for touch. */
export function CompactPracticeChoices({ hands, mode, onHands, onMode, parts }: Props) {
  const { t } = useI18n();
  return (
    <div className="compact-practice">
      <span className="compact-practice__heading">
        {hands === "listen" ? t("Режим: прослушивание") : t("Режим")}
      </span>
      <div className="segmented" role="radiogroup" aria-label={t("Режим игры")}>
        {(
          [
            ["wait", t("Ждать ноту"), t("Ноты ждут, пока вы нажмёте нужную клавишу.")],
            ["tempo", t("В темпе"), t("Песня идёт без остановок в выбранном темпе.")]
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
            aria-checked={!parts?.role && hands === value}
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
      {parts && parts.roles.length > 0 && (
        <div className="compact-practice__hands" role="radiogroup" aria-label={t("Партии")}>
          {parts.roles.map((role) => (
            <button
              key={role}
              type="button"
              className="view-toggle compact-practice__choice"
              role="radio"
              aria-checked={parts.role === role}
              onClick={() => {
                parts.onRole(role);
              }}
            >
              <HandsPicture hands={ROLE_HAND[role]} />
              <span>{t(ROLE_TITLE[role])}</span>
            </button>
          ))}
        </div>
      )}
      <p className="compact-practice__hint">
        {parts?.role
          ? t("Остальное играет программа.")
          : t(HAND_CHOICES.find((choice) => choice.value === hands)?.hint ?? "")}
      </p>
      {parts && hands !== "listen" && (
        <label className="setting">
          <span>{t("Автоаккомпанемент")}</span>
          <input
            type="checkbox"
            checked={parts.accompaniment}
            onChange={(event) => {
              parts.onAccompaniment(event.target.checked);
            }}
          />
        </label>
      )}
    </div>
  );
}
