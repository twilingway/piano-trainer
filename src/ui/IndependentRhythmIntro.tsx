import { useI18n } from "../app/useI18n";
import type { BassReadingKeyBinding } from "./BassReadingIntro";
import { GameDialog } from "./GameDialog";
import { twoHandNoteName } from "./TwoHandProgress";

export const INDEPENDENT_RHYTHM_TITLE = "Играю два ритма";

export function IndependentRhythmBindings({
  bindings
}: {
  bindings: readonly BassReadingKeyBinding[];
}) {
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
          {([48, 60] as const).map((pitch) => (
            <tr key={pitch}>
              <td>{t(pitch === 48 ? "Левая рука" : "Правая рука")}</td>
              <td>
                {twoHandNoteName(pitch, t)} ({pitch === 48 ? "C3" : "C4"})
              </td>
              <td>{pitch === 48 ? 5 : 1}</td>
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

export function IndependentRhythmIntro({
  bindings,
  onStart,
  onClose
}: {
  bindings: readonly BassReadingKeyBinding[];
  onStart: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <GameDialog
      open
      title={t(INDEPENDENT_RHYTHM_TITLE)}
      className="reading-intro"
      onClose={onClose}
    >
      <section className="reading-intro-section">
        <h3>{t("Сначала пульс, затем два ритма")}</h3>
        <p>
          {t(
            "Перед каждой серией сыграйте восемь четвертей C4 при 60 BPM: восемь попаданий в окно ±150 мс и ни одной лишней атаки."
          )}
        </p>
        <p>
          {t(
            "Дождитесь конца проверки. Восемь предварительных попаданий ещё не открывают вторую фазу. Затем отпустите все клавиши и запустите два ритма вручную."
          )}
        </p>
        <p>
          {t(
            "Перед каждой фазой звучат четыре доли отсчёта. После них время идёт непрерывно: ошибка не останавливает курсор и метроном."
          )}
        </p>
        <h3>{t("Две позиции, две ноты")}</h3>
        <p>
          {t(
            "Левая рука — до–соль малой октавы C3–G3, пальцы 5–4–3–2–1. Правая — C4–G4, пальцы 1–2–3–4–5."
          )}
        </p>
        <p>
          {t(
            "В этом курсе слева звучит только C3, справа — только C4. Для проверки пульса нужна только C4."
          )}
        </p>
        <IndependentRhythmBindings bindings={bindings} />
        <p>
          {t(
            "Назначения показаны без переноса октавы и модификаторов. Проверьте октаву; изменить раскладку можно в «Настройки → Ввод с ПК»."
          )}
        </p>
        <p>
          {t(
            "Нотные партии задают руки. Приложение проверяет высоты и атаки, но не видит ваши руки и пальцы."
          )}
        </p>
        <h3>{t("Четыре такта без остановок")}</h3>
        <p>
          {t(
            "В двух тактах слева половинные C3, справа четверти C4; ещё в двух — наоборот. Порядок меняется: всего 24 начала нот, по 12 в каждой партии."
          )}
        </p>
        <p>
          {t(
            "Каждая нота проверяется отдельно в окне ±150 мс. Разрыв совместных атак показывается отдельно, без дополнительного порога 200 мс."
          )}
        </p>
        <p>
          {t(
            "Оцениваются только начала нот. Длительность удержания, легато и педаль не оцениваются. Перед повтором той же ноты полностью отпустите клавишу и нажмите снова."
          )}
        </p>
        <p>
          {t(
            "Без MIDI играйте двумя клавишами ПК или двумя касаниями. Одной мышью совместную атаку выполнить нельзя."
          )}
        </p>
        <p>
          {t(
            "Компьютерная клавиатура должна передавать обе клавиши одновременно. Если она не передаёт сочетание, выберите другие назначения, мультитач или MIDI."
          )}
        </p>
        <p>
          {t(
            "Пауза, уход со страницы, открытие окна или смена настроек отменяют весь проход. Начните снова с проверки пульса; завершённая история сохраняется."
          )}
        </p>
        <p className="reading-muted">
          {t(
            "Проверка пульса — условие этого упражнения. Она не подтверждает освоение ритма или самостоятельное чтение новых нот."
          )}
        </p>
        <button type="button" className="game-button" onClick={onStart}>
          {t("Открыть проверку пульса")}
        </button>
      </section>
    </GameDialog>
  );
}
