import type { Messages } from "./locales";

export const preparationMessages = {
  "Подготовка пианино": { en: "Preparing the piano" },
  "Готовим партию": { en: "Preparing your part" },
  "Готовим изображение": { en: "Preparing the scene" },
  "Загружаем звук": { en: "Loading piano sounds" },
  "Догружаем звук": { en: "Loading extra piano sounds" },
  "Обрабатываем звук": { en: "Decoding piano sounds" },
  "Включаем звук": { en: "Starting the sound" },
  "Загрузка сэмплов звука": { en: "Piano sample download" },
  "Получено {loaded} из {total} МБ": { en: "Received {loaded} of {total} MB" },
  "Ещё {remaining} МБ": { en: "{remaining} MB remaining" },
  "{loaded}/{total} МБ · ещё {remaining}": { en: "{loaded}/{total} MB · {remaining} left" },
  "Не удалось подготовить партию": { en: "Couldn't prepare your part" },
  "Не удалось включить звук": { en: "Couldn't start the sound" },
  "Не удалось загрузить дополнительный звук": { en: "Couldn't load extra piano sounds" },
  "Повторить загрузку звука": { en: "Retry sound loading" },
  "Повторить подготовку партии": { en: "Retry part preparation" }
} satisfies Messages;
