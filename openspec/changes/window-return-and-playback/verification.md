# Приёмка окон и управления песней

2026-10-26. Ветка fix/window-return-and-playback, worktree
E:/MySource/ReactJS/pt-agents/window-return-and-playback, база origin/dev 78c20bc. OpenSpec 5b1ecf9
strict-valid до кода; уточнения review сохраняют блокировки упражнений и новую попытку после
завершённой песни.

## Проверки

- pnpm check: PASS; format, ESLint, strict TS, 3760 PASS / 10 skipped, 420 файлов PASS / 3 skipped,
  React Compiler 23/23, production build.
- pnpm spec:validate: 73/73 PASS до архива.
- Память/навигация/библиотека: 64 узких теста, включая изоляцию, clamp, details до scroll, explicit
  help focus и отсутствие тяжёлого closed-content.
- Транспорт/UI/countdown: 52/52 после исправления pending при 0/resume. Controlled promises
  проверяют cancel/blocked/capture/unmount, false/reject/throw и поздний звук.
- Независимый reviewer: блокирующих замечаний нет после перепроверки zero/resume.
- Дополнительно добавлены только стабильные data-ключи раскрытий IntervalProgress/RhythmProgress;
  format/ESLint этих файлов зелёные. Это не меняет учебное поведение.

Первый полный gate до исправления race также проходил; итоговым считается последующий, с 3760
тестами. Имеющийся Vite large-chunk warning сохранён.

## Видимый Chrome

Отдельный browser context window-return-and-playback; свежая загрузка после freeze. Desktop
1366×900, фактическая viewport-эмуляция 320×568, 390×844 и 667×375. На каждой ширине
document.scrollWidth равен innerWidth, кнопки игры и закрытия видимы. Проверены RU и EN; в итоговой
console ошибок нет.

Наблюдаемые результаты:

- «Вид» desktop: scroll 700 → закрыть → открыть → 700; переход в «Пианино» и назад возвращает 700,
  положение «Пианино» отдельно 250 → 250.
- Раскрытый формат импорта пианино и scroll 1083 → 1083 сохраняются.
- Библиотека: 4200 → 4200 с раскрытым прогрессом; после фактического выбора уровня «Позиция до: пять
  пальцев · Лёгкий — медленно» окно размонтировано, при открытии 4968 → 4968. Повторного выбора
  материала восстановление не вызывает.
- На 320: настройки 600 → 600; библиотека 6000 → 6000. На 390: настройки 750 → 750; на 667: 800 →
  800, библиотека 6000 → 6000.
- Ссылка помощи к отсчёту выбирает «Игра», показывает и фокусирует play-countdown; следующее
  открытие возвращает новое место.
- Desktop обычная песня: play 00:20 → 00:22, изменение dim → 00:23, pause 00:23, resume → 00:24;
  раздел «Вид» и scroll 700 сохраняются.
- На 320 при настройке 0: 33.3333% → play 41.9983%, pause 42.4958%, resume 48.36%; настройки
  остаются открыты, нового отсчёта при resume нет.

Локальные git-ignored артефакты находятся в основной папке .browser-artifacts/:
window-settings-desktop.png, window-playback-desktop.json, window-library-reopened-desktop.png,
window-library-selection.json, window-settings320.png, window-help-target320.png,
window-playback320.png, window-playback320.json, window-library320.png, window-settings390-en.png,
window-library390-en.png, window-settings667-en.png, window-library667-en.png.

## Границы

Память представления действует до reload, без localStorage/IndexedDB, input values и учебных команд.
Обычная песня использует прежние PracticeSession, звук и транспорт. Специальные упражнения, захват
ввода и калибровка не разблокированы. Синтетические UI-нажатия не доказывают аппаратный MIDI, звук,
rollover или multitouch. Общая переработка старых карточек P1–P4 не входит в это изменение.

P5–P8 находятся в отдельном PR #217; для их панели прогресса отдельно согласованы живущий owner
presentation-фильтров и стабильные data-ключи. Эта ветка от dev не включает код курсов. Проверка
объединённого dev после слияния остаётся отдельным этапом.

## Стенд

Собственный сервер session25878, Vite50640 parent52088 остановлен; 5192 свободен. Своя вкладка7
закрыта. Пользовательский5190 PID38040 отвечает HTTP200, чужой5191 PID39900 сохранён. Основная папка
остаётся dev без tracked-изменений. Релиз и слияние не выполнялись.
