import { useI18n } from "../app/useI18n";
import type { BassReadingKeyBinding } from "./BassReadingIntro";
import { twoHandNoteName } from "./TwoHandProgress";

/** The same physical positions and actual bindings serve both coordination courses. */
export function TwoHandBindings({ bindings }: { bindings: readonly BassReadingKeyBinding[] }) {
  const { t } = useI18n();
  return (
    <div className="reading-results-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("Руки")}</th>
            <th>{t("Нота курса")}</th>
            <th>{t("Палец")}</th>
            <th>{t("Клавиши ПК для двух рук")}</th>
          </tr>
        </thead>
        <tbody>
          {([48, 50, 52, 53, 55, 60, 62, 64, 65, 67] as const).map((pitch, index) => (
            <tr key={pitch}>
              <td>{t(index < 5 ? "Левая рука" : "Правая рука")}</td>
              <td>{twoHandNoteName(pitch, t)}</td>
              <td>{index < 5 ? 5 - index : index - 4}</td>
              <td>
                {bindings
                  .filter((item) => item.pitch === pitch)
                  .map((item) => item.label)
                  .join(", ") || t("Нет назначения для этой ноты")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
