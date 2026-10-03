# Аркадные клавиши по новому референсу

Комплект создан встроенным ImageGen по двум изображениям, присланным пользователем:
тёмному макету тренажёра и крупному фрагменту клавиатуры. Пользователь разрешил
заменить клавиши сгенерированными вариантами. Исходный сгенерированный атлас сохранён
в `../ui/arcade-keys-reference-atlas.png`.

Белые клавиши имеют поверхность цвета слоновой кости, тонкую графитовую кромку
и небольшой нижний скос; чёрные — матовую поверхность со светлой узкой кромкой.
Названия нот и цифры не входят в изображения: их рисует существующая система текстур.

## Промпт

Use the user-attached full dark piano trainer mockup and three-key closeup as visual
references. Create a transparent game sprite atlas: four equal-width columns, two rows.
Top row: ivory white normal, ivory white pressed, neutral grayscale white lit, neutral
grayscale white pressed-lit. Bottom row: matte black normal, matte black pressed,
neutral grayscale black lit, neutral grayscale black pressed-lit. Match the reference:
straight-on orthographic key faces, parallel sides, subtle rounded top corners, thin
charcoal outlines, small dark graphite front bevels, slender cool-gray highlight rims
on black keys. Each state keeps the same outer shape. No note names, digits, neighboring
keys, baked neon rail, large external shadows or text. Polished 2D raster UI textures.

## Экспорт

Каждая клавиша вырезана из своей ячейки по границе альфа-канала; очень слабые отдельные
точки вне силуэта не участвуют в вычислении границы. Мягкие края внутри неё сохранены.
Координаты ячеек и обрезки находятся в `extraction.json`.

- Белые PNG: 256×1024, RGBA.
- Чёрные PNG: 160×640, RGBA.
- Четыре состояния: обычное, нажатое, подсвеченное, нажатое подсвеченное.
- Рабочие копии: `src/render/keys-arcade/*.webp`, lossless WebP.
- Границы nine-slice: `slices.json`, согласованы с `KEY_STYLES.arcade` в `KeyboardLayer.ts`.

Направляющие обычного вида идут по границам белых клавиш, с более заметной границей
каждой октавы. Дополнительных линий у краёв чёрных клавиш нет.
