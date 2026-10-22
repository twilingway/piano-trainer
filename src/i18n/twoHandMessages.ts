import type { Messages } from "./locales";

export const twoHandMessages: Messages = {
  Палец: { en: "Finger" },
  "Нет назначения для этой ноты": { en: "No binding for this note" },
  "Показана помощь уровня {level}": { en: "Help level {level} was shown" },
  "до♯": { en: "C♯" },
  "ре♯": { en: "D♯" },
  "фа♯": { en: "F♯" },
  "соль♯": { en: "G♯" },
  "ля♯": { en: "A♯" },
  "Две руки: играю вместе": { en: "Two hands: play together" },
  "Нажмите «Играть» и дождитесь пары на двух станах.": {
    en: "Press Play and wait for the pair on both staves."
  },
  "Сыграйте обе ноты вместе. Разница атак — не больше 200 мс.": {
    en: "Play both notes together, no more than 200 ms apart."
  },
  "Нажмите вторую ноту, продолжая держать первую.": {
    en: "Play the second note while holding the first."
  },
  "Отпустите все клавиши. Пара ещё проверяется.": {
    en: "Release all keys. The pair is still being checked."
  },
  "Неверная нота. Отпустите все клавиши и повторите пару.": {
    en: "Wrong note. Release all keys and try the pair again."
  },
  "Вторая атака опоздала. Отпустите все клавиши и сыграйте вместе.": {
    en: "The second attack was too late. Release all keys and play together."
  },
  "Первая клавиша отпущена слишком рано. Отпустите всё и повторите пару.": {
    en: "The first key was released too soon. Release all keys and try again."
  },
  "Нажата лишняя нота. Отпустите все клавиши и повторите пару.": {
    en: "You played an extra note. Release all keys and try again."
  },
  "Используйте один способ ввода для пары. Отпустите всё и повторите.": {
    en: "Use one input method for the pair. Release all keys and try again."
  },
  "Не удалось проверить ввод. Отпустите все клавиши и повторите пару.": {
    en: "The input could not be checked. Release all keys and try again."
  },
  "Нет данных о совместной атаке": { en: "No joint attack data yet" },
  "Решено пар": { en: "Pairs completed" },
  "Ошибки совместной атаки": { en: "Joint attack errors" },
  "Самостоятельные первые пары": { en: "Independent first attempts" },
  "Пары с помощью": { en: "Pairs with help" },
  "Пары, решённые без помощи": { en: "Pairs solved without help" },
  "Медиана разрыва атак, мс": { en: "Median gap between attacks, ms" },
  "Медиана первой атаки пары, мс": { en: "Median first attack latency, ms" },
  "Медиана решения пары, мс": { en: "Median pair solution latency, ms" },
  "Медиана самостоятельной первой атаки, мс": { en: "Median independent first attack latency, ms" },
  "Результат совместной игры": { en: "Two-hand result" },
  "Попыток пары: {number}": { en: "Pair attempts: {number}" },
  "Разрыв успешных атак: {number} мс": { en: "Gap between successful attacks: {number} ms" },
  "Уровень помощи пары: {number}": { en: "Pair help level: {number}" },
  "Совместная атака засчитана": { en: "Joint attack accepted" },
  "Атаки попытки: {notes}": { en: "Notes attacked: {notes}" },
  "Помощь {level} через {number} мс": { en: "Help level {level} after {number} ms" },
  "Способ ввода для сводки двух рук": { en: "Input method for the two-hand summary" },
  "Сводка последних двадцати серий. Фильтр выбирает пары по успешной попытке; прежние ошибки и помощь сохраняются.":
    {
      en: "Summary of the last twenty series. The filter uses each pair's successful attempt; earlier errors and help are retained."
    },
  "Мой прогресс двух рук": { en: "My two-hand progress" },
  "История совместной игры: {number}": { en: "Two-hand history: {number}" },
  "Десять пар: басовый ключ слева и скрипичный справа. Читайте и нажимайте обе ноты вместе.": {
    en: "Ten pairs: bass clef on the left and treble clef on the right. Read and play both notes together."
  },
  "Знакомство с совместной игрой": { en: "Introduction to playing together" },
  "Начать десять пар": { en: "Start ten pairs" },
  "Выйти из совместной игры": { en: "Leave two-hand practice" },
  "Серия двух рук завершена": { en: "Two-hand series completed" },
  "Без MIDI играйте двумя клавишами ПК или двумя касаниями. Одной мышью совместную атаку выполнить нельзя.":
    {
      en: "Without MIDI, use two computer keys or two touches. One mouse pointer cannot play both notes together."
    },
  "Текущая пара: {notes}": { en: "Current pair: {notes}" },
  "До–соль в двух октавах": { en: "C–G in two octaves" },
  "Левая рука — до–соль малой октавы C3–G3, пальцы 5–4–3–2–1. Правая — C4–G4, пальцы 1–2–3–4–5.": {
    en: "Left hand: C3–G3, fingers 5–4–3–2–1. Right hand: C4–G4, fingers 1–2–3–4–5."
  },
  "Нотные партии задают руки. Приложение проверяет высоты и атаки, но не видит ваши руки и пальцы.":
    {
      en: "The score assigns the hands. The app checks pitches and attacks, but cannot see your hands or fingers."
    },
  "Клавиши ПК для двух рук": { en: "Computer keys for both hands" },
  "Назначения показаны без переноса октавы и модификаторов. Проверьте октаву; изменить раскладку можно в «Настройки → Ввод с ПК».":
    {
      en: "Bindings are shown without octave shifts or modifiers. Check your octave; change the layout in Settings → Computer keyboard input."
    },
  "Сначала две атаки, затем отпускание": { en: "Two attacks, then release" },
  "Нажмите точные ноты пары с разницей не больше 200 мс и держите первую до второй. Затем отпустите все клавиши без лишней ноты.":
    {
      en: "Play the exact notes no more than 200 ms apart, holding the first until the second. Then release all keys without playing an extra note."
    },
  "200 мс — учебное окно совместной атаки. Попадание в метроном и длительность удержания здесь не оцениваются; педаль не заменяет нажатую клавишу.":
    {
      en: "200 ms is the practice window for playing together. Metronome timing and hold duration are not scored here; the pedal does not replace a held key."
    },
  "После отпускания проверка ждёт до 250 мс на доставку событий. Пока пара проверяется, не начинайте следующую.":
    {
      en: "After release, checking allows up to 250 ms for event delivery. Wait for the check before starting the next pair."
    },
  "Компьютерная клавиатура должна передавать обе клавиши одновременно. Если она не передаёт сочетание, выберите другие назначения, мультитач или MIDI.":
    {
      en: "Your computer keyboard must register both keys together. If it cannot, choose different bindings, multitouch, or MIDI."
    }
};
