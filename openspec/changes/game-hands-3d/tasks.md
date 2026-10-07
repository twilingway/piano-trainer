# Tasks

## 1. Кончики и игровой экспорт

- [x] 1.1 `tools/hand-rig/game_tips.py`: подушечки пяти пальцев каждой позы в пикселях `camtop`,
      поза рига восстанавливается после прогона, `tools/hand-rig/poses/tips.json`. Проверка: 42
      позы, отклонение нажатых пальцев от центра клавиши ≤ 6 мм; наложение точек на 4 рендера
- [x] 1.2 `export.py`: игровой набор `src/render/hands/rendered/<id>.webp` (кроп, `GAME_SCALE` 0.75,
      запечённое растворение запястья) и `catalog.json` (кончики в пикселях кропа, нажатые пальцы,
      `pixelsPerKey`); описание в `tools/hand-rig/README.md`. Проверка: 42 webp 648×768, размер
      набора ≤ 1 МБ, `catalog.json` на 42 позы

## 2. Каталог и подбор

- [x] 2.1 `src/render/handRenderCatalog.ts` из `catalog.json` и URL webp. Тесты: 42 позы, у каждой
      конечные кончики пяти пальцев и URL; `fitPose` выбирает `fingers-18` для D/G пальцами 2/5,
      `triad` для C-E-G 1-3-5, `octave` для C4/C5 1/5, зеркальную позу для левой руки. Проверка:
      `pnpm exec vitest run src/render/handRenderCatalog.test.ts`
- [x] 2.2 `handPoseSet(style, drawn, rendered)`: 3D-набор при «3D» и хотя бы одной загруженной позе,
      иначе рисованный. Тесты на пустой, частичный и полный 3D-набор

## 3. Слой и настройка

- [x] 3.1 `HandsLayer.setStyle`: ленивая загрузка 3D-текстур, частичная ошибка оставляет остальные,
      смена вида сбрасывает картинки; `FallingNotesView`/`useFallingView` передают вид. Проверка:
      `pnpm typecheck`, `pnpm test`
- [x] 3.2 `StaffPrefs.handStyle` (по умолчанию и при порче — `"drawn"`), select «Вид рук» в
      `KeyboardSettings`, строки локализации. Тесты: чтение сохранённых настроек без поля и с
      неизвестным значением; select меняет настройку. Проверка: `pnpm test`

## 4. Проверка

- [x] 4.1 `pnpm check`, `pnpm spec:validate`; скриншот игры с 3D-руками (обе руки, трезвучие и
      октава) — прозрачность и масштаб на клавишах; глазами проверил пользователь на стенде 5190
