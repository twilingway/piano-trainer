import type { Messages } from "./locales";

export const freeCameraMessages: Messages = {
  "Высота горизонта, м": { en: "Horizon height, m" },
  "Дальность горизонта, м": { en: "Horizon distance, m" },
  "Ширина горизонта, м": { en: "Horizon width, m" },
  "Радиус мирового горизонта, м": { en: "World horizon radius, m" },
  "Высота — нижняя точка горизонта относительно белых клавиш; отрицательная высота опускает его ниже клавиатуры. Дальность отсчитывается от задней линии клавиш. У выпуклой дуги середина выше, у вогнутой — края.":
    {
      en: "Height is the lowest horizon point relative to the white keys; a negative height places it below the keyboard. Distance starts at the back line of the keys. A convex arc rises in the middle; a concave arc rises at the edges."
    },
  "Ширина — расстояние между крайними источниками. Радиус меняет изгиб отдельно от ширины и не может быть меньше её половины: слишком малое значение увеличивается до этого предела. В режиме линии радиус сохраняется без изгиба.":
    {
      en: "Width is the distance between the outermost sources. Radius controls curvature independently and cannot be less than half the width: smaller values are raised to that limit. Line mode keeps the radius without curving the horizon."
    },
  "Форма горизонта": { en: "Horizon shape" },
  Линия: { en: "Line" },
  "Выпуклая дуга": { en: "Convex arc" },
  "Вогнутая дуга": { en: "Concave arc" },
  "Горизонт — точки появления нот. Высота — нижняя точка над белыми клавишами, дальность — от задней линии клавиш. У выпуклой дуги середина выше, у вогнутой — края.":
    {
      en: "The horizon contains note spawn points. Height is the lowest point above the white keys; distance is measured from the back line of the keys. A convex arc rises in the middle; a concave arc rises at the edges."
    },
  "Ширина задана в метрах мира и не меняется при вращении камеры. У каждой клавиши выбранного диапазона, включая чёрные, свой постоянный источник; повторные ноты идут из него же.":
    {
      en: "Width is measured in world metres and stays the same when you orbit the camera. Each key in the selected range, including black keys, has a fixed source; repeated notes come from that same source."
    },
  "Как настроить горизонт в свободной камере?": {
    en: "How do I adjust the horizon in the free camera?"
  },
  "Горизонт — линия или дуга точек появления нот, их источников. В «Вид / Камера нот и мира» настройте его высоту, дальность, ширину и форму в метрах мира. Прямая и перспективная проекции сохраняют свои настройки отдельно. Высота — нижняя точка над белыми клавишами, дальность — от задней линии клавиш. У выпуклой дуги середина выше, у вогнутой — края. Вращение камеры меняет ракурс, а не ширину. Каждая клавиша диапазона, включая чёрные, имеет постоянный источник: повторные ноты идут из него же.":
    {
      en: "The horizon is a line or arc of note spawn points, called sources. In View / Notes and world camera, adjust its height, distance, width and shape in world metres. Direct and perspective projections keep separate settings. Height is the lowest point above the white keys; distance is measured from the back line of the keys. A convex arc rises in the middle; a concave arc rises at the edges. Orbiting changes the viewing angle, not the width. Every key in the range, including black keys, has a fixed source: repeated notes come from the same point."
    },
  "Отрицательные значения задают ширину дальнего края относительно экрана основного вида; свободная камера меняет его ракурс.":
    {
      en: "Negative values set the far edge width relative to the standard view's screen; the free camera changes its viewing angle."
    },
  "Передвижение WASD": { en: "Move with WASD" },
  "WASD передвигает камеру вместо игры на клавишах. В меню и полях ввода передвижение отключено.": {
    en: "WASD moves the camera instead of playing notes. Movement is disabled in menus and text fields."
  },
  "Вернуться к пианино": { en: "Return to the piano" },
  "Свободная камера": { en: "Free camera" },
  "СКМ — вращать": { en: "MMB — orbit" },
  "Shift + СКМ — перемещать": { en: "Shift + MMB — pan" },
  "Колесо — масштаб": { en: "Wheel — zoom" }
};
