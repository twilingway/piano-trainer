import type { Messages } from "./locales";

export const graphicsMessages = {
  "Номера октав на клавишах": { en: "Octave numbers on keys" },
  "C{octave}": { en: "C{octave}" },
  "Не удалось показать нотный стан в 3D. Оставили обычный вид.": {
    en: "Could not show the score in 3D. The regular score is still available."
  },
  "Графика не поддерживается": { en: "Graphics are not supported" },
  "Графика недоступна": { en: "Graphics are unavailable" },
  "Графическое соединение прервано": { en: "Graphics connection lost" },
  "Для игрового поля нужен WebGL2. Этот браузер не предоставляет его. Попробуйте обновить браузер или открыть игру на другом устройстве.":
    {
      en: "The game view requires WebGL2, which this browser does not provide. Try updating your browser or opening the game on another device."
    },
  "Браузер потерял графический контекст. Исполнение приостановлено. После восстановления продолжите игру кнопкой «Играть».":
    {
      en: "The browser lost its graphics context. Playback is paused. Once graphics recover, press Play to continue."
    },
  "Браузер поддерживает WebGL2, но не смог запустить графику. Проверьте аппаратное ускорение и драйвер видеокарты, затем повторите попытку.":
    {
      en: "Your browser supports WebGL2 but could not start graphics. Check hardware acceleration and your graphics driver, then try again."
    },
  "Библиотека, настройки и нотный стан остаются доступны. Ваша песня и настройки сохранены.": {
    en: "The library, settings, and score remain available. Your song and settings are preserved."
  },
  "Повторить запуск графики": { en: "Retry graphics" },
  "Ожидаем восстановления графики…": { en: "Waiting for graphics to recover…" }
} satisfies Messages;
