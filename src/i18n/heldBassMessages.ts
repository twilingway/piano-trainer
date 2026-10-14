import type { Messages } from "./locales";

export const heldBassMessages: Messages = {
  "Дождитесь начала фрагмента. Пока не нажимайте клавиши.": {
    en: "Wait for the fragment to start before pressing any keys."
  },
  "Держите бас и сыграйте следующую правую ноту.": {
    en: "Keep the bass held and play the next right-hand note."
  },
  "Держу бас, играю мелодию": { en: "Hold the bass, play the melody" },
  "Знакомство с удержанием баса": { en: "Introduction to holding the bass" },
  "Бас остаётся, мелодия движется": { en: "Keep the bass held while the melody moves" },
  "Десять фрагментов: пять по две и пять по четыре ноты справа. Слева держите до–соль малой октавы C3–G3, справа играйте C4–G4.":
    {
      en: "Ten fragments: five with two right-hand notes and five with four. Hold C3–G3 on the left and play C4–G4 on the right."
    },
  "Начните вместе и продолжайте держать бас": { en: "Start together, then keep the bass held" },
  "Нажмите бас и первую ноту мелодии с разницей не больше 200 мс, удерживая первую до второй. Затем играйте правые ноты по курсору, не отпуская бас.":
    {
      en: "Play the bass and first melody note no more than 200 ms apart, holding the first until the second. Then follow the cursor with the right hand while keeping the bass held."
    },
  "Когда курсор ждёт следующую ноту, бас тоже надо держать. Отпустите все клавиши только по сообщению о конце фрагмента. Педаль не заменяет нажатую клавишу.":
    {
      en: "Keep the bass held while the cursor waits for the next note. Release all keys only when the fragment tells you to. The pedal does not replace a held key."
    },
  "Две соседние правые ноты могут перекрываться. Перед третьей разной высотой отпустите старую. Повтор той же высоты требует отпускания и новой атаки.":
    {
      en: "Two neighbouring right-hand notes may overlap. Release the older one before a third different pitch. A repeated pitch needs a release and a fresh attack."
    },
  "Ранняя атака, ошибка ноты или отпускание баса повторяют весь текущий фрагмент. Завершённые фрагменты сохраняются. После паузы начните текущий фрагмент заново.":
    {
      en: "An early attack, wrong note, or bass release restarts the whole current fragment. Completed fragments are kept. After pausing, start the current fragment again."
    },
  "Здесь проверяется удержание баса, а не точность ритма, длительность правых нот или качество легато.":
    {
      en: "This checks the bass hold, not rhythm accuracy, right-hand note lengths, or legato quality."
    },
  "Без MIDI используйте клавиатуру ПК или настоящий мультитач. Одной мышью удержать бас и сыграть мелодию нельзя.":
    {
      en: "Without MIDI, use computer keys or real multitouch. One mouse pointer cannot hold the bass and play the melody."
    },
  "Начать десять фрагментов с басом": { en: "Start ten bass-hold fragments" },
  "Нажмите «Играть» и дождитесь фрагмента на двух станах.": {
    en: "Press Play and wait for the fragment on both staves."
  },
  "Нажмите бас и первую ноту вместе: не больше 200 мс между атаками.": {
    en: "Play the bass and first note together, no more than 200 ms apart."
  },
  "Нажмите вторую ноту начала, продолжая держать первую.": {
    en: "Play the second starting note while holding the first."
  },
  "Держите бас. Дождитесь следующей ноты под курсором.": {
    en: "Keep the bass held. Wait for the next note under the cursor."
  },
  "Держите бас до конца фрагмента. Пока не отпускайте.": {
    en: "Hold the bass until the fragment ends. Do not release yet."
  },
  "Отпустите все клавиши. Проверяем удержание баса.": {
    en: "Release all keys. Checking the bass hold."
  },
  "Начните фрагмент заново, продолжая удерживать бас после начальной пары.": {
    en: "Start the fragment again and keep the bass held after the starting pair."
  },
  "Не удалось проверить удержание. Отпустите всё и начните фрагмент заново.": {
    en: "The hold could not be checked. Release everything and restart the fragment."
  },
  "Неверная нота фрагмента. Отпустите всё и начните его заново.": {
    en: "Wrong note in the fragment. Release everything and restart it."
  },
  "Начальные атаки слишком далеко друг от друга. Отпустите всё и повторите фрагмент.": {
    en: "The starting attacks are too far apart. Release everything and try the fragment again."
  },
  "Бас или первая клавиша начала отпущены слишком рано. Отпустите всё и повторите фрагмент.": {
    en: "The bass or first starting key was released too early. Release everything and retry the fragment."
  },
  "Сначала дождитесь следующей ноты. Отпустите всё и повторите фрагмент.": {
    en: "Wait for the next note first. Release everything and retry the fragment."
  },
  "Лишняя атака во фрагменте. Отпустите всё и начните его заново.": {
    en: "Extra attack in the fragment. Release everything and restart it."
  },
  "Для фрагмента используйте один способ ввода. Отпустите всё и повторите.": {
    en: "Use one input method for the fragment. Release everything and retry."
  },
  "Отпустите предыдущую ноту мелодии. Сейчас отпустите всё и повторите фрагмент.": {
    en: "Release the previous melody note. For now, release everything and retry the fragment."
  },
  "Нет данных об удержании баса": { en: "No bass-hold data" },
  "Решено фрагментов с басом": { en: "Bass-hold fragments solved" },
  "Ошибки фрагментов с басом": { en: "Bass-hold fragment errors" },
  "Самостоятельные первые фрагменты с басом": { en: "Independent first-attempt fragments" },
  "Фрагменты с помощью": { en: "Fragments with help" },
  "Фрагменты, решённые без помощи": { en: "Fragments solved without help" },
  "Медиана разрыва начальных атак, мс": { en: "Median starting attack gap, ms" },
  "Медиана первой атаки фрагмента, мс": { en: "Median first fragment attack, ms" },
  "Медиана решения фрагмента, мс": { en: "Median fragment response, ms" },
  "Медиана самостоятельной атаки фрагмента, мс": { en: "Median independent first attack, ms" },
  "Медиана удержания баса, мс": { en: "Median physical bass hold, ms" },
  "Результат удержания баса": { en: "Bass-hold result" },
  "Попыток фрагмента: {number}": { en: "Fragment attempts: {number}" },
  "Уровень помощи фрагмента: {number}": { en: "Fragment help level: {number}" },
  "Фрагмент с удержанием засчитан": { en: "Bass-hold fragment accepted" },
  "Помощь на ноте {number}: уровень {level}": { en: "Help on note {number}: level {level}" },
  "Способ ввода для сводки удержания баса": { en: "Input method for the bass-hold summary" },
  "Последние двадцать серий удержания. Фильтр выбирает фрагменты по успешной попытке; прежние ошибки и помощь сохраняются.":
    {
      en: "The last twenty bass-hold series. The filter selects fragments by their successful attempt; earlier errors and help are kept."
    },
  "Мой прогресс удержания баса": { en: "My bass-hold progress" },
  "История удержания баса: {number}": { en: "Bass-hold history: {number}" },
  "Удерживайте левую ноту, пока правая играет две или четыре ноты мелодии. Десять фрагментов на двух станах.":
    {
      en: "Hold the left-hand note while the right plays two or four melody notes. Ten fragments on two staves."
    },
  "Серия удержания баса завершена": { en: "Bass-hold series complete" },
  "Фрагмент с басом {number} из 10": { en: "Bass-hold fragment {number} of 10" },
  "Мелодия: нота {number} из {total}": { en: "Melody: note {number} of {total}" },
  "Выйти из удержания баса": { en: "Leave bass-hold practice" },
  "Бас и ожидаемая нота: {notes}": { en: "Bass and expected note: {notes}" }
};
