import type { Messages } from "./locales";

export const projectionMessages = {
  "Проекция: дорожек {lanes}, пересечений {crossings}": {
    en: "Projection: {lanes} lanes, {crossings} crossings"
  },
  "Художественная проекция недоступна для этого ракурса. Измените ракурс или вернитесь к пианино.":
    {
      en: "Stylized projection is unavailable from this angle. Change the view or return to the piano."
    },
  "Проекция: эффективный радиус {radius}": { en: "Projection: effective radius {radius}" },
  "Как настроить сферический горизонт художественной проекции?": {
    en: "How do I adjust the spherical horizon in stylized projection?"
  },
  "В «Вид / Падающие ноты» выберите художественную систему проекции для 3D-клавиш. Радиус меняет изгиб горизонта и фона, а не камеру. Настройте размах, высоту и выпрямление у клавиш. Диагностика показывает источники и контакты всех 88 дорожек; при неподходящем ракурсе сохраняется прежняя проекция.":
    {
      en: "Under View / Falling notes, select the stylized projection system for 3D keys. Radius bends the horizon and background without changing the camera. Adjust spread, height, and straightening near the keys. Debug view shows all 88 sources and key contacts; an unsuitable camera angle keeps legacy projection."
    },
  "Система проекции": { en: "Projection system" },
  "Прежняя проекция": { en: "Legacy projection" },
  "Художественная проекция": { en: "Stylized projection" },
  "Художественная проекция работает с видом клавиш «3D». Другие виды сохраняют прежнюю проекцию.": {
    en: "Stylized projection works with the 3D keyboard. Other keyboard styles keep their existing projection."
  },
  "Пресеты художественной проекции": { en: "Stylized projection presets" },
  "Прямой горизонт": { en: "Flat Horizon" },
  "Изогнутый горизонт": { en: "Curved Horizon" },
  "Кинематографический закат": { en: "Cinematic Sunset" },
  "Высота экранного горизонта": { en: "Screen horizon height" },
  "Размах экранного горизонта": { en: "Screen horizon spread" },
  "Радиус горизонта": { en: "Horizon radius" },
  "Кривая приближения нот": { en: "Note approach curve" },
  "Выпрямление у клавиш": { en: "Straighten near keys" },
  "Масштаб нот у клавиш": { en: "Note scale near keys" },
  "Масштаб нот у горизонта": { en: "Note scale at horizon" },
  "Свечение дорожек": { en: "Lane glow" },
  "Свечение блоков нот": { en: "Note block glow" },
  "Диагностика 88 дорожек": { en: "Debug 88 lanes" },
  "Показывать каждую 12-ю дорожку": { en: "Show every 12th lane" },
  "Только геометрия без фона и свечения": { en: "Geometry only, without background or glow" },
  "{parameter}: числовое значение": { en: "{parameter}: numeric value" },
  "Меньше радиус — сильнее изгиб, больше радиус — горизонт прямее. Радиус и размах заданы в долях ширины игрового поля; высота и выпрямление — в долях его высоты.":
    {
      en: "A smaller radius bends the horizon more; a larger radius makes it flatter. Radius and spread use fractions of the game view width; height and straightening use fractions of its height."
    },
  "Направление дуги горизонта": { en: "Horizon arc direction" },
  "Середина выше краёв": { en: "Center above edges" },
  "Середина ниже краёв": { en: "Center below edges" }
} satisfies Messages;
