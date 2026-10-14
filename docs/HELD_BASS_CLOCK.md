# Часы фрагмента с удержанием баса

`PracticeSession` остаётся единственным музыкальным clock. Held-bass policy принимает физические
down/up до обычного judgement и записи дубля; она не воспроизводит ноты и не продвигает Song.

`registerVerifiedOnsets` привязывает последовательность onset к `runId`, `fragmentId` и свежему
`presentationId`. Область можно зарегистрировать один раз в новой сессии или после её начальной
загрузки на паузе, до первого принятого onset. Разрешены только wait, обе руки, скорость1,
отключённые accompaniment/noteResult, точная форма двух либо четырёх долей: первая группа из двух
нот и следующие одиночные RH. ID, длина Song и onset сверяются с текущим Song.

`commitVerifiedOnset` проверяет эти identities и номер шага, exact current due IDs, отсутствие
повторов, paused/finished и конечный timestamp не раньше последнего clock tick/commit. Отклонение не
меняет ноты или clock. Принятие отмечает текущую группу и перепривязывает тот же SongTimeline к
моменту commit. Прежний `commitWaitingGroup` остаётся отдельным API только для группы из двух нот.
Само принятие onset не означает педагогический успех всего фрагмента.

`clockReceipt(atMs)` возвращает копии настоящих anchors, songTime, waiting, ended и due IDs. Чтение
между кадрами ограничивает projection точной pending-onset границей; следующий tick ставит тот же
freeze anchor. Музыкальный end — crossing `song.duration`: при registered held-bass scope tick
фиксирует speed0 именно на этой границе, без добавления обычного inputGrace. Historical anchors
сохраняют pauses, waits и возобновления. Компенсация ввода применяется к raw один раз в shell;
оценивающий core строит raw end из того же corrected crossing и фиксированного offset попытки.

Экспорт ограничен65 anchors: 65-й служит свидетельством переполнения допустимых64 transitions, а не
сокращённым валидным proof. Оценщик отменяет такую попытку; успешная история не может опираться на
усечённую временную карту. Копии receipts не позволяют переписать внутренний clock.

`Trainer.configureHeldBass` исключает reading/rhythm/pair policy. Raw input поступает и при движении
к следующему onset, и после музыкального конца. `onFrame` может вернуть scoped request; shell
подтверждает его результатом настоящего commit и новым receipt. Cues подтверждаются после draw.
Preheld передаются через общий `TrainerInputHolds` как владение, без искусственных атак.

Автоматическое событие `finished` в этом режиме не вызывает silence, cancel, запись дубля,
рейтинговый callback или loop. Trainer продолжает принимать физические releases и frame callbacks,
пока core доказывает полный release и250мс delivery horizon. Только итоговый core-result разрешает
оболочке загрузить следующий свежий Song. Явная пауза, выход и потеря input по-прежнему отменяют
кандидата и выключают программный звук. Local cancel сохраняет прочих физических owners; global
reset очищает общий реестр. MIDI/мультитач и слышимый звук проверяются отдельно с игроком.

Проверки: scoped2→1, stale run/fragment/presentation/step, subset/duplicates/future IDs/badtime,
pause/finish/unregistered mode, readiness между15/60FPS, end без inputGrace, immutable receipts,
terminal release/no silence/no take/no rating, offset, preheld и регрессии ordinary/pair/rhythm.
