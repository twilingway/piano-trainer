# Tasks

## 1. План и согласование

- [x] 1.1 Подтянуть merge159 ff-only и проверить основной5190: текущие served modules, переход двух
      нот, release/следующий фрагмент, сохранность истории; evidence previous change.
- [x] 1.2 Read-only spec_architect/explorer, proposal/specs/design; проверить одноclock TEMPO,
      независимые members и существующие WAIT/tap guards.
- [x] 1.3 Независимое ревью плана, pnpm check/spec:validate, evidence, draft task PR в dev;
      проверить чистый основной dev и опубликованный SHA.
- [ ] 1.4 Пользователь подтверждает конкретные правила proposal; записать ответ в verification. Ни
      одна production задача2–6 не начинается до1.4.

## 2. Генератор и формы фаз — после1.4

- [ ] 2.1 Pulse8 и multiset A,A,B,B, MusicXML/Song60BPM/4/4/2+4такта,24notes/12perhand/8joint; tests
      нового core проверяют XML parsing IDs/onsets/durations/6orders/nextSeed;
      docs/INDEPENDENT_RHYTHMS.md объясняет две фазы и позиции.
- [ ] 2.2 Phase/run/presentation/scene identities и manualstart/fullrelease; app Compiler tests
      проверяют свежие Songs на переходе/повторе и отсутствие переноса разрешения после cancel.

## 3. Чистая оценка — после1.4

- [ ] 3.1 Pitch/hand member matching,±150/151,ties/joint/perhandmiss/extra/pulse8/8; pure tests
      покрывают оба порядка совместной атаки, spread300, wrong octave, ранний up без штрафа и
      heldrepeat; docs описывает метрики и непроверяемые длительности.
- [ ] 3.2 Raw/corrected/received/clock replay и ownership; pure tests age0/250/251/future,
      stale/up-prefix/multiowner/offset±/initialearly/end/delivery/tie/overflow/15/60FPS; docs
      фиксирует границы and conservative deadlines.
- [ ] 3.3 Strict whole-result/pulse/help validator; pure tests поддельных fingerprints/IDs,
      clock/speed/origin/offset/gate/finality/metrics, valid errors24notes иnullmedians; docs
      объясняет различие допуска и результата.

## 4. TEMPO shell — после1.4

- [ ] 4.1 Отдельный tempoClockReceipt без pending-note clipping; practice tests actualclock,
      countIn4/early−150/end/fixedoffset/pause, прежние WAIT/pair/rhythm regressions.
- [ ] 4.2 Исходные Down/Up observer policy иterminal gate, actualpitch audio, безremap/take/rank;
      Trainer tests обе руки/lateevent/postend/nonselected/explicitpause/cancel/preheld;
      docs/INDEPENDENT_RHYTHMS_CLOCK.md описывает единственныйclock иobserver.
- [ ] 4.3 Boundary tests дополнительно проверяют first−151ignored, origin поdelivery с первымwrong
      ипереставленнымиканалами, lateDown послеactualend сpositiveoffset/correctedinside,
      pulse-finalizing иконсервативныеmissdeadlines; documented examples
      вINDEPENDENT_RHYTHMS_CLOCK.md.

## 5. UI и IndexedDB — после1.4

- [ ] 5.1 Card/intro/pulse/retry/main/manualplay/help/results RU/EN с действующими bindings; UI/app
      tests переходов, failedgate, окна/hidden/loss, staleaudio/staff, preferences,
      repeatedseed/Compiler. Документировать отсутствие physicalhand/fingerdetection.
- [ ] 5.2 Schema8/independentRhythm имиграции1–7/atomicmerge/history20; persistence tests
      allsiblings/P2/legacy/dedupe/latehydrate/abort/quota/readerror/future/corrupt/rollback7;
      docs/INDEPENDENT_RHYTHMS_PERSISTENCE.md иMIDIguide после реальных кнопок.

## 6. Интеграция и доставка — после1.4

- [ ] 6.1 Implementation reviewer, relevantnarrowtests, pnpm check иpnpm spec:validate;
      production≤500lines, localization, purecore иcurrentSHA evidence.
- [ ] 6.2 Видимый Chrome на существующем5190/sourcebranch: pulsefailed/pass,full24,wrong/miss,
      cancel/repeat/heldrelease/end/reload/filters,RU/EN,desktop/320×568/390×844/667×375/settings;
      screenshots/actualframes/console отдельно от физическогоMIDI.
- [ ] 6.3 TaskPR вdev; послеusermerge ff-only mainfolder, verifyCI/servedSHA/cleanbranch,
      обновитьverification без запуска сервера.
- [ ] 6.4 После всех roadmapшагов совместная аппаратнаяприёмка поMIDI_COURSE_ACCEPTANCE.md; до неё
      оставить «не проверено», неархивироватьchange инеблокировать согласованные шаги.
