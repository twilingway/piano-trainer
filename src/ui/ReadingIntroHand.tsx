import { useI18n } from "../app/useI18n";
import { READING_INTRO_NOTES } from "../reading/introduction";
import { HAND_SPRITES } from "../render/handSpriteCatalog";

const hand = HAND_SPRITES.find((sprite) => sprite.id === "five");

/** Reuse the renderer's hand and its measured finger centres, without a practice view. */
export function ReadingIntroHand({
  selectedPitch,
  onSelect
}: {
  readonly selectedPitch: number;
  readonly onSelect: (pitch: number) => void;
}) {
  const { t } = useI18n();
  const selected =
    READING_INTRO_NOTES.find((note) => note.pitch === selectedPitch) ?? READING_INTRO_NOTES[0];
  return (
    <div className="reading-intro-hand-study">
      {hand && (
        <svg
          className="reading-intro-hand"
          viewBox="100 50 780 780"
          role="img"
          aria-label={t("Схема правой руки: {finger}, палец {number}, выделен", {
            finger: t(selected.fingerName),
            number: selected.finger
          })}
        >
          <image href={hand.url} width="1024" height="1024" />
          {READING_INTRO_NOTES.map((note) => {
            const tip = hand.tips[note.finger];
            return (
              <g key={note.finger} aria-hidden="true">
                <circle
                  className={`reading-intro-hand-tip${selectedPitch === note.pitch ? " is-selected" : ""}`}
                  data-finger={note.finger}
                  cx={tip.x}
                  cy={tip.y}
                  r="37"
                />
                <text x={tip.x} y={tip.y} textAnchor="middle" dominantBaseline="central">
                  {note.finger}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <div
        className="reading-intro-finger-buttons"
        role="group"
        aria-label={t("Выбор пальца правой руки для знакомства")}
      >
        {READING_INTRO_NOTES.map((note) => (
          <button
            key={note.finger}
            type="button"
            className="game-button"
            aria-pressed={selectedPitch === note.pitch}
            onClick={() => {
              onSelect(note.pitch);
            }}
          >
            <span className="reading-intro-finger-number" aria-hidden="true">
              {note.finger}
            </span>
            <span>{t(note.fingerName)}</span>
            <small>{note.notation}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
