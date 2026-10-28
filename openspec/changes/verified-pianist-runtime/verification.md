# Проверка продолжения, 28 октября 2026

Статус: работа продолжается; весь этап и игровая анимация не завершены. Ветка
`feat/keyboard88-hands-runtime` от свежего `origin/dev` (`6d738d54`). Основная папка `dev` и
пользовательский5190 не менялись. PR221 подтверждён merged.

## Сохранность и независимые измерения

SHA исходного atlas, final-stop review и manifest совпали с handoff. Приватная лаборатория старого
worktree сохранена; новые эксперименты находятся в ignored `blender/labs/continuation-20261028/`.
Blender открыл сохранённый review631 без dirty-изменений; HUD активен, по одному load_pre/load_post
handler, verified33/unverified0 для versioned audit mappings. Это не новый полный audit атласа.

Новый two-anchor construction и 3D advancing-front ears не дали полного cap. Вместо дальнейшего
перебора обнаружены6 пар original unsplit skin triangles с настоящими пересечениями исходной LEFT
геометрии. Fraction и независимый Cramer согласованы. Saved Blender readback с правильной frozen
ROW-map подтвердил все6 пар, сегменты0,225–1,602мм; maximum numeric/saved coordinate error
0,0000506мм. Первое чтение с неверным ROW order отвергнуто и сохранено как
INVALID_MAPPING_NOT_EVIDENCE. Это отказ embeddedness source631 для новой калибровки, а не расширение
physical query или отмена исторических checkpoint64/RH-гейтов. Новая pose base готовится отдельно с
null calibration.

## C3 и покрытие

Prepared exact40 выполнен:12/12 RED. Cold12×160 выполнен с прежними исходными starts, затем выполнен
fresh exact160:12/12 RED. Frames592/593/598 остаются открытыми. Все исходники совпали до/после,
overall physical_class=null и eligible_for_write=false; новых записей в atlas нет.

Диагностика нашла две причины для нового отдельного solver profile: gated press-band cost исчезает
при потере XY plateau samples; stale collision planes делают best scores разных шагов несравнимыми.
Следующий профиль сохраняет физический judge/bounds/masks и естественную форму свободных пальцев,
меняет мягкий acquisition objective и заново ранжирует свежие оценки. Это не ослабление допуска.

LEFT inventory74 и C6 пока NOT_RUN; bilateral/world/kernel и строгий yaw writer остаются открытыми.

## Совместимость игрового пути

Реальные public GLB/index:52кости, parent/rest/root совпадают, inversebind max difference
3,934865e-7 при mesh-relative convention. Новый guard проверяет действительную hierarchy/rest/root/
mesh/bind/inversebind и cleanup до texture decode; same-name несовместимость отклоняется.

Private native GLB имеет68костей вместо source52, иной rest/bind, split forearm twists и
metacarpals; длины upperarm отличаются до33,207мм, forearm до22,758мм. Body mesh/morph и nails также
различаются. Исходная Blender кожа использует subdivision, PSD/SIDE и отдельные ногти; публичный
экспорт этих correctives не содержит. Поэтому нужен offline target-rig solve с повторным surface
audit; копирование quaternion или успешный rig guard не подтверждают игровые контакты.

## Выполненные проверки

- Narrow rig/loader tests:33PASS, включая actual public GLB и negative hierarchy/rest/bind cases.
- Независимое review: блокирующих ошибок production diff не найдено.
- `pnpm check`: PASS,4428tests +23compiler tests,10существующих skipped,
  typecheck/lint/format/build.
- `pnpm spec:validate`:81/81PASS; существующий duplicate task1.7 warning относится к
  game-visual-update.
- Semantic synthetic/source controls:17PASS; original and saved skin witnesses проверены отдельно.
- Видимый Chrome на5191: реальный loader загрузил1215frames/52bones/3skinned primitives/2textures,
  dispose завершился. Ошибок console нет; есть существующие autoplay/shader warnings. Это проверка
  loader, не приёмка новой анимации.

Стенд: `http://localhost:5191/`, новая ветка, новый worktree. Его PID/managed session записаны в
приватном session-ownership.json; после завершения стенд должен быть остановлен и порт проверен.
