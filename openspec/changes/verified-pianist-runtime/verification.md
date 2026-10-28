# Проверка продолжения, 28 октября 2026

Статус: работа продолжается; игровая анимация и весь этап не завершены. Ветка
`feat/keyboard88-hands-runtime` от свежего `origin/dev` (`6d738d54`). Основная папка `dev` и
пользовательский5190 не менялись; PR221 подтверждён merged. Промежуточный draft:
https://github.com/twilingway/piano-trainer/pull/243.

## Выбранный игровой риг

Пользователь посмотрел обе реальные модели со скелетами и выбрал серую основную модель на52кости.
Сравнение было отдельным ignored просмотром на5191; стенд остановлен, порт освобождён.

Actual public52 и saved Blender: все6890 Basis vertices/13776faces совпали точно. Public top4 joint
IDs/Float32 weights воспроизводятся точно; rest/bind совпадают в пределах Float32 rounding
(rest3,02e-7, inversebind1,71e-7, head/tail3,22e-7м). Это тот же rig/base, другая анатомия не нужна.
Полный исходный skin имеет дополнительные влияния: maximum discarded weight0,00561679. В public
нет1670frame-baked pose corrections, subdivision2, GN PAD/SIDE и отдельных ногтей. Требуется
приватный corrective export с отдельным surface proof; один перенос quaternion недостаточен.

Отдельная модель68костей не выбрана для интеграции. Её compatibility/GPU/Three исследования
сохранены только как локальная диагностика, не как новый игровой результат.

## Сохранность источников

SHA исходного atlas, final-stop review и manifest совпали с handoff. Checkpoint64/frozen C4, старые
сцены и физические маски сохранены. Все новые эксперименты находятся только в ignored
`blender/labs/continuation-20261028/` нового worktree, исходная лаборатория не переписывается.

Blender открыл saved review631 без dirty-изменений. HUD активен с одним load_pre/load_post handler,
verified33/unverified0 для versioned audit mappings; это не новый полный audit атласа. Независимый
public52 comparison подтвердил неизменность filepath/frame/viewport/dirty/HUD.

## Collision/containment: фактическая диагностика

Two-anchor и 3D advancing-front caps не дали полного допустимого диска на старой геометрии.
Обнаружены6пар original unsplit skin intersections; Fraction и независимый Cramer согласованы. Saved
Blender с правильной frozen ROW-map подтвердил все6пар: сегменты0,225–1,602мм, maximum numeric/saved
coordinate error0,0000506мм. Первое чтение с неверным ROW order отвергнуто и сохранено как
INVALID_MAPPING_NOT_EVIDENCE.

Выполнены99новых source candidates: LEFT collar/swivel18, wrist lift20/40мм36, shared torso27 и
wrist lift80/120мм18; baseline/rebuild controls считаются отдельно. Все новые позы имеют raw
full156/FK/PSD/world-wrist/pelvis/length/source guards, но это не физический допуск. Known52 exact
ledger последней семьи:13/18clear только по перечисленным witness pairs.

Один расширенный global source audit lift80 остановлен по maxbad512, а не завершил полный обход.
Найдены84 LEFT index↔бедро пересечения в прежнем физическом LEFT-body query scope и428 BODY-only
own-fold intersections вне этого scope. На lift120 все эти84 известные пересечения пальца
устранены;246известных BODY-only пересечений сохраняются. Это ограниченная region map, не полный
LEFT/world PASS, не доказательство полного embeddedness и не расширение физических исключений.

Для вычислительного барьера подготовлен отдельный `certified-exterior-v2` профиль; архитектурное
review подтвердило sound sufficient proof по полностью свободному лучу через всю замкнутую
complement surface. Winding0, отсутствие crossing и близость к внутренней складке не дают PASS.
Physical masks/query/skip90/near30/allowances не меняются. BODY-only folds остаются диагностикой;
LEFT/RIGHT closure/embeddedness, caps internality, полный GPU exterior query proof и saved readback
ещё нужны. Исторические UNRESOLVED отчёты не переименовываются; calibration остаётся null.

## C3 и оставшееся покрытие

Prepared exact40:12/12RED. Cold12×160 выполнен, затем fresh exact160:12/12RED. Новый active
contact-acquisition160 и fullbounded160 также выполнены и независимо exact rejudged:12/12RED каждый.
Frozen source и overall admission fields сохранены; новых записей в atlas нет.

Fresh-objective backtracking:3seeds, ровно10итераций. Loss снизился592:295,38→244,80;
593:374,23→251,63;598:68,66→67,01. Это численная диагностика, не физический PASS. Fresh exact3 снова
RED. Фактические trial traces показали finite press-band jump при первом XY plateau sample, который
перекрывает правильное descent направление. Отдельный paired continuous-acquisition experiment
использует те же initial seeds и прежние hard gates; raw band сохраняется диагностикой. Его
результат фиксируется отдельным report, старый контрольный run не меняется.

Frames592/593/598 остаются открытыми. LEFT inventory74/C6, strict yaw writer, bilateral/world,
переходы, corrective export и визуальная приёмка не завершены. Накопленная исходная сводка
840GREEN/92YELLOW/686RED не является новым полным аудитом.

## Проверки кода и границы результатов

- Rig/loader narrow tests33PASS, включая реальный public GLB и wrong hierarchy/rest/bind cases.
- Независимое production review: блокирующих ошибок не найдено.
- `pnpm check`: PASS,4428tests +23compiler tests,10существующих skipped,
  typecheck/lint/format/build.
- `pnpm spec:validate`:81/81PASS; старый duplicate task1.7 warning относится к game-visual-update.
- Видимый Chrome loader smoke:1215frames/52bones/3skinned primitives/2textures, dispose выполнен.
  Console errors отсутствовали; существующие autoplay/shader warnings записаны. Это не animation
  acceptance.
- Public52/static Blender compatibility controls6PASS; source kernel controls23PASS.
- Для каждого нового GPU profile отдельно выполнены pure/source tests, PLAN/hash checks и
  independent review.
- Native68 optional GPU/actualThree parity: source0 4,44e-16м, nonzero70surfaces4,58e-16м; это
  только compatibility evidence невыбранного пути, не contact/physical acceptance.

Приватные MANO/SMPL+H, GLB, текстуры, позы, NPZ, картинки и экспериментальные скрипты не входят в
Git или production. Numerical, saved Blender, export, browser и visual gates остаются отдельными.
Собственные PID/порты/managed sessions записываются в локальный session-ownership.json; после
завершения каждого временного стенда проверяется освобождение его порта.

## Новые отдельные проверки

Fresh source120 factory пересчитала756 exact affine vertices и4 native anchors. При прежнем90мм
predicate обнаружены114 дополнительных LEFT eligible ROW относительно source631; пропусков query не
допускается. Все4 новых shoulder/collar fan-caps отвергнуты cap–skin audit; closed interfaces,
internality и source admission ещё не получены.

Root независимо подтвердил Cramer-предикатом15 original unsplit own-part skin intersection pairs из
caps-v10. LEFT witnesses около elbow18, RIGHT около shoulder17. Проверка физических masks показала:
эти конкретные пары не образуют arm↔opposite-body пары; длины сегментов не являются depth. Receipt:
`semantic/source120-witness-unsplit-anatomy-root-v1.json`, SHA
`7db26275a92f8ca4b961b1d9369a584c5f2b171a2aaae9faf4878049f583685f`. Архитектурное review разрешило
отдельный v3 без global original-part embeddedness; все прежние actual-skin hard gates, cap validity
и source requirements остаются обязательными.

Синтетический interval exterior GPU parity завершён PASS:8 fixtures, полный пакетный face/ray обход
совпал с Fraction reference. Report `semantic/exterior-v2/runs/84b23c2dfb25/report.json`, SHA
`4bbbfa53581021eeed2ac49497ceaedac4b6e23e81d18a83548ceaeeb0ac096c`, global peak4320MiB. Это kernel
proof на synthetic fixtures; actual model intake остаётся NOTREADY. Два предыдущих runner/broadcast
отказа сохранены, исправления прошли независимое review и24 CPU tests.

Paired continuous C3 сохранил те же initial3seeds: все нажатые пальцы получили actual plateau
samples, но proxy PASS не получен. Fresh exact3 завершён:592/593/598 RED по контактам и skin/key.
Report `c3-continuous-acquisition/exact/runs/0381989d026c/report.json`; global peak5642MiB. Один
найденный trace-intake пропуск исправлен: diagnostic terms проверяются на каждом baseline, trial и
final;19 integration/source tests и независимое review PASS. Нужны дальнейшие решения, а не запись
этих кандидатов в atlas.

Read-only Blender631 full-surface export input: skin165314 vertices/330624triangles и5 RIGHT nails
по1450vertices/2896triangles. Report `surface-readback631/report.json`, SHA
`7792ca337bae3ede42ab92c3af257c58192d152a16e399ec90494bb79819f70c`.
Frame/dirty/viewport/selection/HUD handlers не изменились. Это input для разработки приватного
экспорта, не готовый runtime asset и не physical admission; LEFT nail geometry в источнике
отсутствует.

Новый полный boundary audit подтвердил4 transverse пересечения старых interface edges с original
unsplit skin (по2 LEFT/RIGHT); Cramer и strict barycentric signs согласованы. Поэтому никакой cap с
этими границами не допустим. `semantic/caps-v11/fixed-interface-blocker.json` сохраняет отказ.

Read-only threshold prior выявил другую допустимую computational partition без смены physical masks:
пороги2/5,3/10,1/5,1/10 строго сохраняют все6 query-наборов, по одному closed degree2 contour для
каждой руки. Exact common ownership interval: (0,04999914644689589;0,5000655037229187). Full-face
bound min(max L,max R)<=0,06943010304000344 исключает mixed-family faces при этих порогах. Receipt
`semantic/caps-v11/proximal-threshold-design-prior.json`, SHA
`1a5a96f98439b3f6f55c14aa4f35be06723ef38d77635aa38923a4cacea9645c`. Архитектурное review разрешило
реализацию нового cut. Его новые full interfaces/caps/source proof ещё не выполнены; прежние отказы
не переименовываются.
