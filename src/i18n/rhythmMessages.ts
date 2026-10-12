import type { Messages } from "./locales";

export const rhythmMessages: Messages = {
  "Для калибровки нажимайте пробел или «Ударить» под метроном.": {
    en: "For calibration, press Space or Tap in time with the metronome."
  },
  Ритм: { en: "Rhythm" },
  "Ритм под метроном": { en: "Rhythm with a metronome" },
  "Читайте четыре такта и отбивайте ритм: четверти, половинные и паузы.": {
    en: "Read four bars and tap the rhythm: quarter notes, half notes and rests."
  },
  "Высота нот не проверяется. Можно начать без пианино.": {
    en: "Pitch is not assessed. You can start without a piano."
  },
  "Читать и отбивать ритм": { en: "Read and tap the rhythm" },
  "Пробел или кнопка с клавиатуры": { en: "Space or keyboard activation of the button" },
  "Кнопка мышью или касанием": { en: "Mouse or touch on the button" },
  "Повторить этот ритм": { en: "Repeat this rhythm" },
  "Выйти из ритма": { en: "Leave rhythm" },
  "Темп ритма, BPM": { en: "Rhythm tempo, BPM" },
  "Способ ввода ритма": { en: "Rhythm input method" },
  "4 такта · 10 ударов · окно ±150 мс. Половинную не нужно удерживать.": {
    en: "4 bars · 10 taps · ±150 ms window. You do not need to hold half notes."
  },
  "Компенсация ввода: {offset} мс.": { en: "Input compensation: {offset} ms." },
  "Нет профиля калибровки: компенсация ввода 0 мс.": {
    en: "No calibration profile: input compensation is 0 ms."
  },
  "Нет профиля калибровки: ручная компенсация {offset} мс.": {
    en: "No calibration profile: manual compensation is {offset} ms."
  },
  "Калибровка ритма": { en: "Rhythm calibration" },
  "Выберите темп и способ ввода, затем начните ритм.": {
    en: "Choose a tempo and input method, then start the rhythm."
  },
  "Готовим стан и метроном…": { en: "Preparing the score and metronome…" },
  "Слушайте отсчёт. Первая нота — после четырёх долей.": {
    en: "Listen to the count-in. The first note starts after four beats."
  },
  "Отбивайте начала нот. На паузах не нажимайте.": {
    en: "Tap the start of each note. Do not tap during rests."
  },
  "Серия ритма завершена.": { en: "Rhythm set complete." },
  "Серия прервана без результата. Начните снова с отсчёта.": {
    en: "The set was interrupted without a result. Start again with the count-in."
  },
  "Ритм не начался. Проверьте готовность и повторите.": {
    en: "The rhythm did not start. Check that everything is ready and try again."
  },
  "Доля отсчёта: {beat} из 4": { en: "Count-in beat: {beat} of 4" },
  "Подключите и выберите MIDI-устройство или смените способ ввода.": {
    en: "Connect and select a MIDI device, or choose another input method."
  },
  "Не удалось включить метроном. Включите звук и начните ритм снова.": {
    en: "Couldn't start the metronome. Enable sound and start the rhythm again."
  },
  "Начать ритм": { en: "Start rhythm" },
  Ударить: { en: "Tap" },
  "Изменение настроек или уход со страницы прерывает серию. Незавершённая серия не сохраняется.": {
    en: "Changing settings or leaving the page interrupts the set. Unfinished sets are not saved."
  },
  "Результат ритма": { en: "Rhythm result" },
  "Ожидаемые удары": { en: "Expected taps" },
  "Попадания ритма": { en: "Rhythm hits" },
  "Ранние попадания": { en: "Early hits" },
  "Поздние попадания": { en: "Late hits" },
  "Пропуски ритма": { en: "Missed taps" },
  "Лишние удары": { en: "Extra taps" },
  "Из них в паузах": { en: "Of these, during rests" },
  "Попадания: {hits} из {expected} ({percent}%).": {
    en: "Hits: {hits} of {expected} ({percent}%)."
  },
  "Медиана отклонения, мс": { en: "Median signed deviation, ms" },
  "Медиана абсолютного отклонения, мс": { en: "Median absolute deviation, ms" },
  "Нет данных об отклонении ритма": { en: "No rhythm deviation data" },
  "Мой прогресс ритма": { en: "My rhythm progress" },
  "История ритма: {number}": { en: "Rhythm history: {number}" },
  "Хранятся последние 20 завершённых серий ритма. Темпы, способы ввода и компенсации считаются отдельно.":
    {
      en: "The last 20 completed rhythm sets are kept. Tempos, input methods and compensation settings are summarised separately."
    },
  "Правила ритма: {version}": { en: "Rhythm rules: {version}" },
  "Темп: {bpm} BPM · {source}": { en: "Tempo: {bpm} BPM · {source}" },
  "С профилем калибровки": { en: "With a calibration profile" },
  "Без профиля калибровки": { en: "Without a calibration profile" },
  "Компенсации, мс: ввод {input}, вручную {manual}, звук {audio}, вид {visual}.": {
    en: "Compensation, ms: input {input}, manual {manual}, audio {audio}, view {visual}."
  },
  "нет данных": { en: "no data" },
  "Завершённых серий: {number}": { en: "Completed sets: {number}" },
  "Нет завершённых серий ритма.": { en: "No completed rhythm sets yet." }
};
