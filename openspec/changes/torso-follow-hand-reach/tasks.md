# Задачи

## 1. Новый yaw codec и source identity

- [x] 1.1 Добавить новую typed версию absolute torso yaw/hand controls с explicit collar и source
      base, не меняя frozen функции; roundtrip source yaw и отрицательных углов, NaN/window/mixed
      relative/absolute и double-source negatives проходят.
- [x] 1.2 Провести один и тот же yaw в CPU/GPU full pose; FK, posed surface и градиенты ±yaw
      согласованы, pelvis/translation/длины костей неизменны; зафиксировать команды и SHA в
      локальном proof.

## 2. Правая рука с поворотом корпуса

- [ ] 2.1 Добавить yaw в optimizer/seed/snapshot/restore-best, exact judge и entry/full156;
      настоящий yaw присутствует на каждом этапе, прежние
      own-key/pressed-set/arm/skin/finger/natural gates и source incumbent сохранены; единый torso и
      проверка world geometry неактивной LEFT действуют уже здесь; tests/PLAN/review PASS.
- [ ] 2.2 Зафиксировать конечный RH smoke inventory с центральной позой, проблемными C3 и дальними
      клавишами; GPU ledger содержит новые результаты либо явные отказы, фактическое направление
      torso и полный source/code/model/membership proof.

## 3. Правая запись и просмотр

- [ ] 3.1 Добавить отдельный строгий writer profile для yaw, резерв и schema dispatch; старый route
      не принимает запрос с потерянным yaw, serialization full156 identity и independent saved-scene
      torso/contact/negative checks PASS.
- [ ] 3.2 Пересчитать surface/SIDE/nails, проверить frozen C4 и незапрошенные данные; сохранить
      реальные виды сверху/сбоку с явным отдельным visual status и протоколом запуска/очистки
      собственных процессов.

## 4. Нативная левая анатомия

- [x] 4.1 Добавить hand-aware native LEFT source chains/axes/weights/pad labels и evaluated-ID→ROW
      contract в новых модулях/сцене; source/anatomy/geometry proof и wrong-hand/mirrored-right
      negatives PASS, старые RIGHT данные неизменны.
- [x] 4.2 Провести native LEFT collar/arm/finger controls через отдельные codec/FK с прежними
      bounds; CPU/GPU parity full156/FK/PSD/gradients, source identity, reachable/unreachable, RIGHT
      local preservation и независимые negatives PASS. Физический judge закрывается задачами4.3–4.5.
- [ ] 4.3 Реализовать отдельный certified-exterior-v2 kernel/intake: closed oriented BODY chain,
      embedded LEFT/RIGHT, complementary caps и exact internality; полные zero-hit ray certificates
      без сокращения query/face coverage. Pure negative fixtures и source/kernel review PASS.
- [ ] 4.4 Проверить неизменный historical source; при отказе отдельно подготовить pose base с новым
      происхождением. GPU exterior proof всех обязательных query, прежние physical gates и saved
      Blender readback подтверждают source без нормирования BODY folds; иначе calibration=null.
- [ ] 4.5 Подключить v2 в per-candidate exact GPU judge для обеих рук и обоих complements;
      интервальная неоднозначность/inside без boundary witness дают UNRESOLVED, прежние
      masks/allowances сохранены. Полное вложение, cancellation, internal-face, t0/coplanar/tangent
      и missing-face negatives PASS.

## 5. Левый диапазон до C6

- [x] 5.1 Зафиксировать inventory A0–C6/MIDI21–84 с белыми/чёрными, одиночными/совместными нажатиями
      и явной аппликатурой; C6 включён, MIDI85 дляLEFT отклоняется, каждый объявленный target имеет
      запись ledger.
- [ ] 5.2 Выполнить bounded LEFT GPU-smoke и source/readback проверки; фактический C6 подтверждён
      native left pad и точным pressed set, остальные случаи имеют результат/диагностику, без
      заявлений о произвольных аккордах или доказанной невозможности.

## 6. Один корпус для двух рук

- [ ] 6.1 Добавить общий torso state с одним yaw/lean/bend/base и отдельными arm/collar controls;
      тесты одного активного/двух активных и конфликтующих torso (включая одинаковый yaw при разном
      lean) не дают ложного bimanual PASS.
- [ ] 6.2 Проверить полную pose156, вторую неактивную руку и межручные/arm-body/keyboard
      столкновения в одной геометрии; joint GPU proof, запись и независимый Blender-readback
      согласованы, visual acceptance хранится отдельно.

## 7. Проверка этапа и публикация

- [ ] 7.1 Независимое review подтверждает спецификацию, pure numeric boundaries, source guards и
      тесты каждого этапа; опубликованный diff не содержит приватных моделей, поз и производных
      сеток.
- [ ] 7.2 Выполнить pnpm check и pnpm spec:validate, обновить PR/coverage ledger с точным текущим
      статусом; ни локальный атлас, ни отдельный geometry PASS не объявляются готовой игровой
      интеграцией.
