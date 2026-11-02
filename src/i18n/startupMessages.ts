import type { Messages } from "./locales.ts";

export const startupMessages: Messages = {
  "Загружаем пианино": { en: "Loading your piano" },
  "Готовим сцену и ноты": { en: "Preparing the scene and score" },
  "Осталось: уточняется": { en: "Remaining: calculating" },
  "Для запуска: примерно {total} МБ ресурсов": { en: "To start: about {total} MB of resources" },
  "Осталось примерно {remaining} МБ ресурсов": {
    en: "About {remaining} MB of resources remaining"
  },
  "Ресурсы: {loaded} МБ · из кеша {cached} МБ": {
    en: "Resources: {loaded} MB · cached: {cached} MB"
  },
  "Сетевой трафик: {network} МБ": { en: "Network traffic: {network} MB" },
  "В текущих загрузках осталось {remaining} МБ": {
    en: "Current downloads: {remaining} MB remaining"
  },
  "Не удалось загрузить пианино": { en: "Could not load the piano" },
  "Проверьте подключение и попробуйте ещё раз": { en: "Check your connection and try again" },
  "Перезагрузить страницу": { en: "Reload the page" },
  "Для запуска пианино включите JavaScript": { en: "Enable JavaScript to start the piano" }
};
