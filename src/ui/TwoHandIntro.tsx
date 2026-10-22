import { useI18n } from "../app/useI18n";
import { GameDialog } from "./GameDialog";
import { TwoHandBindings } from "./TwoHandBindings";
import type { BassReadingKeyBinding } from "./BassReadingIntro";

export function TwoHandIntro({
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
      title={t("Знакомство с совместной игрой")}
      className="reading-intro"
      onClose={onClose}
    >
      <section className="reading-intro-section">
        <h3>{t("До–соль в двух октавах")}</h3>
        <p>
          {t(
            "Левая рука — до–соль малой октавы C3–G3, пальцы 5–4–3–2–1. Правая — C4–G4, пальцы 1–2–3–4–5."
          )}
        </p>
        <p>
          {t(
            "Нотные партии задают руки. Приложение проверяет высоты и атаки, но не видит ваши руки и пальцы."
          )}
        </p>
        <TwoHandBindings bindings={bindings} />
        <p>
          {t(
            "Назначения показаны без переноса октавы и модификаторов. Проверьте октаву; изменить раскладку можно в «Настройки → Ввод с ПК»."
          )}
        </p>
        <h3>{t("Сначала две атаки, затем отпускание")}</h3>
        <p>
          {t(
            "Нажмите точные ноты пары с разницей не больше 200 мс и держите первую до второй. Затем отпустите все клавиши без лишней ноты."
          )}
        </p>
        <p>
          {t(
            "200 мс — учебное окно совместной атаки. Попадание в метроном и длительность удержания здесь не оцениваются; педаль не заменяет нажатую клавишу."
          )}
        </p>
        <p>
          {t(
            "После отпускания проверка ждёт до 250 мс на доставку событий. Пока пара проверяется, не начинайте следующую."
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
        <button type="button" className="game-button" onClick={onStart}>
          {t("Начать десять пар")}
        </button>
      </section>
    </GameDialog>
  );
}
