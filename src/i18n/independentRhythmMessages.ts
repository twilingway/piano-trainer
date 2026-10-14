import type { Messages } from "./locales";

export const independentRhythmMessages: Messages = {
  "Играю два ритма": { en: "Play two rhythms" },
  "Сначала пульс, затем два ритма": { en: "Check the pulse, then play two rhythms" },
  "Перед каждой серией сыграйте восемь четвертей C4 при 60 BPM: восемь попаданий в окно ±150 мс и ни одной лишней атаки.":
    {
      en: "Before each series, play eight C4 quarter notes at 60 BPM: eight hits within ±150 ms and no extra attacks."
    },
  "Дождитесь конца проверки. Восемь предварительных попаданий ещё не открывают вторую фазу. Затем отпустите все клавиши и запустите два ритма вручную.":
    {
      en: "Wait for the check to finish. Eight provisional hits do not open the next phase yet. Then release all keys and start the two rhythms yourself."
    },
  "Перед каждой фазой звучат четыре доли отсчёта. После них время идёт непрерывно: ошибка не останавливает курсор и метроном.":
    {
      en: "Each phase starts with four count-in beats. Time then runs continuously: mistakes do not stop the cursor or metronome."
    },
  "Две позиции, две ноты": { en: "Two hand positions, two notes" },
  "В этом курсе слева звучит только C3, справа — только C4. Для проверки пульса нужна только C4.": {
    en: "This course uses only C3 in the left part and C4 in the right. The pulse check uses only C4."
  },
  "Четыре такта без остановок": { en: "Four bars without stopping" },
  "В двух тактах слева половинные C3, справа четверти C4; ещё в двух — наоборот. Порядок меняется: всего 24 начала нот, по 12 в каждой партии.":
    {
      en: "Two bars have C3 half notes on the left and C4 quarter notes on the right; two have the reverse. Their order varies: 24 note attacks, 12 per part."
    },
  "Каждая нота проверяется отдельно в окне ±150 мс. Разрыв совместных атак показывается отдельно, без дополнительного порога 200 мс.":
    {
      en: "Each note is checked separately within ±150 ms. The gap between joint attacks is shown separately, with no additional 200 ms limit."
    },
  "Оцениваются только начала нот. Длительность удержания, легато и педаль не оцениваются. Перед повтором той же ноты полностью отпустите клавишу и нажмите снова.":
    {
      en: "Only note attacks are scored. Hold duration, legato, and pedal use are not scored. Fully release a key before playing that note again."
    },
  "Пауза, уход со страницы, открытие окна или смена настроек отменяют весь проход. Начните снова с проверки пульса; завершённая история сохраняется.":
    {
      en: "Pausing, leaving the page, opening a window, or changing settings cancels the whole run. Start again with the pulse check; completed history is kept."
    },
  "Проверка пульса — условие этого упражнения. Она не подтверждает освоение ритма или самостоятельное чтение новых нот.":
    {
      en: "The pulse check is a requirement for this exercise. It does not certify rhythm mastery or independent reading of new notes."
    },
  "Открыть проверку пульса": { en: "Open the pulse check" },
  "Знакомство с двумя ритмами": { en: "Introduction to two rhythms" },
  "Проверка пульса и четыре такта с разными ритмами слева и справа. Только C3 и C4, 60 BPM.": {
    en: "A pulse check followed by four bars with different rhythms in the left and right parts. C3 and C4 only, at 60 BPM."
  },
  "Проверка пульса C4": { en: "C4 pulse check" },
  "Два ритма C3/C4": { en: "Two rhythms: C3/C4" },
  "Выберите способ ввода, отпустите все клавиши и начните проверку пульса.": {
    en: "Choose an input method, release all keys, and start the pulse check."
  },
  "Пульс проверен. Отпустите все клавиши и вручную начните два ритма.": {
    en: "Pulse check passed. Release all keys, then start the two rhythms yourself."
  },
  "Слушайте четыре доли отсчёта. Затем играйте C4 по пульсу.": {
    en: "Listen to four count-in beats. Then play C4 with the pulse."
  },
  "Слушайте четыре доли отсчёта. Затем играйте обе партии по нотам.": {
    en: "Listen to four count-in beats. Then play both parts from the score."
  },
  "Играйте восемь четвертей C4 по пульсу. Перед повтором отпускайте клавишу.": {
    en: "Play eight C4 quarter notes with the pulse. Release the key before each repeat."
  },
  "Играйте C3 слева и C4 справа по курсору. Ошибка не останавливает время.": {
    en: "Follow the cursor with C3 on the left and C4 on the right. Mistakes do not stop time."
  },
  "Проверка пульса ещё завершается. Дождитесь итогового допуска.": {
    en: "The pulse check is still finishing. Wait for the final decision."
  },
  "Проверяем последние атаки двух ритмов. Дождитесь результата.": {
    en: "Checking the final attacks of the two rhythms. Wait for the result."
  },
  "Пульс пока не пройден: нужны 8 попаданий и 0 лишних атак. Повторите или потренируйтесь в «Ритме».":
    {
      en: "Pulse check not passed: you need 8 hits and no extra attacks. Retry or practise in Rhythm."
    },
  "Два ритма завершены. Сравните показатели левой и правой партий.": {
    en: "Two rhythms completed. Compare the left and right part metrics."
  },
  "Проход двух ритмов отменён без результата. Повтор начинается с проверки пульса.": {
    en: "The two-rhythm run was cancelled without a result. Retrying starts with the pulse check."
  },
  "Два ритма не готовы. Проверьте звук, ноты и выбранный ввод, затем повторите.": {
    en: "The two rhythms are not ready. Check the sound, score, and input method, then retry."
  },
  "Способ ввода двух ритмов": { en: "Input method for two rhythms" },
  "Канал двух ритмов: {channel}": { en: "Two-rhythm channel: {channel}" },
  "Канал MIDI определится первой атакой проверки пульса.": {
    en: "The first pulse-check attack will select the MIDI channel."
  },
  "Показать клавиши перед стартом": { en: "Show keys before starting" },
  "Позиции и назначения двух ритмов": { en: "Two-rhythm positions and bindings" },
  "Пульс: C4. Два ритма: C3 слева и C4 справа.": {
    en: "Pulse: C4. Two rhythms: C3 on the left and C4 on the right."
  },
  "Отпустите все нажатые клавиши перед стартом фазы.": {
    en: "Release all held keys before starting the phase."
  },
  "Начать проверку пульса": { en: "Start the pulse check" },
  "Начать два ритма": { en: "Start two rhythms" },
  "Повторить с проверки пульса": { en: "Retry from the pulse check" },
  "Выйти из двух ритмов": { en: "Leave two rhythms" },
  "Перейти к курсу «Ритм»": { en: "Go to the Rhythm course" },
  "Пульс: 8 четвертей · 60 BPM · окно ±150 мс · 0 лишних атак.": {
    en: "Pulse: 8 quarter notes · 60 BPM · ±150 ms window · no extra attacks."
  },
  "Два ритма: 4 такта · 24 начала нот · 60 BPM · окно ±150 мс для каждой ноты.": {
    en: "Two rhythms: 4 bars · 24 note attacks · 60 BPM · ±150 ms for each note."
  },
  "Нет данных о двух ритмах": { en: "No two-rhythm data" },
  "Левая партия C3": { en: "Left part: C3" },
  "Правая партия C4": { en: "Right part: C4" },
  "Раздельный результат партий": { en: "Results by part" },
  "Всего лишних атак двух ритмов": { en: "Total extra two-rhythm attacks" },
  "Лишние атаки неизвестной партии": { en: "Extra attacks with unknown part" },
  "Медиана разрыва совместных атак двух ритмов, мс": {
    en: "Median gap between joint two-rhythm attacks, ms"
  },
  "Результат двух ритмов": { en: "Two-rhythm result" },
  "Способ ввода для сводки двух ритмов": { en: "Input method for the two-rhythm summary" },
  "Мой прогресс двух ритмов": { en: "My two-rhythm progress" },
  "История двух ритмов: {number}": { en: "Two-rhythm history: {number}" },
  "Хранятся последние 20 завершённых серий двух ритмов. Фильтр выбирает весь проход по способу ввода, сохраняя его ошибки и помощь.":
    {
      en: "The last 20 completed two-rhythm series are kept. The filter selects whole runs by input method, keeping their mistakes and help."
    },
  "Завершённых серий двух ритмов: {number}": { en: "Completed two-rhythm series: {number}" },
  "Пульс пройден в этом проходе": { en: "Pulse check passed in this run" },
  "Подсветка клавиш показана при подготовке": { en: "Key hints shown during preparation" },
  "Подсветка клавиш при подготовке не показана": { en: "No key hints shown during preparation" }
};
