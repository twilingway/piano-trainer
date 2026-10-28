import type { Messages } from "./locales";
export const cameraCompositionMessages: Messages = {
  "Угол обзора мира, °": { en: "World field of view, °" },
  "Камера клавиатуры": { en: "Keyboard camera" },
  "Камера нот и мира": { en: "Notes and world camera" },
  "Сбросить камеру клавиатуры": { en: "Reset keyboard camera" },
  "Сбросить камеру мира": { en: "Reset world camera" },
  "Угол обзора мира действует в свободной камере. В обычном виде дальнюю часть поля задают горизонт и ширина у горизонта.":
    {
      en: "The world field of view applies to the free camera. In the standard view, the horizon and the width at the horizon shape the far field."
    },
  "Во время постановки используется её камера. Выбранный вид вернётся после выключения постановки.":
    {
      en: "The performance scene uses its own camera. Your view returns when you turn it off."
    },
  "Свободная камера показывает всю сцену. Ракурс клавиатуры вернётся после её выключения.": {
    en: "The free camera shows the whole stage. The keyboard view returns when you turn it off."
  },
  "Выпрямление дороги": { en: "Road straightening" },
  "По кнопке": { en: "On button" },
  "Выпрямить по клавиатуре": { en: "Straighten to keyboard" },
  "Наклон нот за клавиатурой": { en: "Note tilt with keyboard" },
  "Выпрямление дороги действует в обычном виде без свободной камеры и постановки.": {
    en: "Road straightening applies to the standard view without the free camera or the performance scene."
  },
  "Дорожки нот всегда идут прямо к клавишам при любой камере клавиатуры.": {
    en: "Note lanes always run straight to the keys, whatever the keyboard camera."
  },
  "Кнопка выпрямляет дорожки под текущую камеру клавиатуры. После нового наклона у клавиш снова появится излом.":
    {
      en: "The button straightens the lanes for the current keyboard camera. After a new tilt, the bend near the keys returns."
    }
};
