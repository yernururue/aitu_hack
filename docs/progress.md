# Состояние проекта

Stage: implementation

Дата: 20.10.2026, Asia/Almaty. План утверждён; повторное согласование не требуется.
Текущие статусы/следующий шаг — [tracker.yaml](../tracker.yaml).

## Выполнение MVP

- **M3 offline acceptance:** root `pnpm lint/typecheck/test/build/check:build-artifacts/test:e2e`, harness и diff-check — exit0;465unit/13files,46browser cases/390+1440,6NFT/1568entries. Независимые M3.1–M3.5 reviews PASS. Визуально просмотрены реальные3park screenshots. Production cross-mode smoke подтвердил runtime disabled/stub после stub-build, без захвата режима сборкой. Каталог298/источники/hash совпали; paid trial не выполнялся, OpenRouter0. Stage commit создаётся перед следующим этапом.

- **M3.4 done:** stage-aware metric P2 исправлен (3 RED →22 eval GREEN), независимый re-review PASS, root full strict TS/lint PASS. **M3.5 in_progress:** подключение UI с честной пометкой stubs и браузерной проверкой настоящего API. Root real-catalog handler smoke уже подтвердил парк/строгие отказы/уточнение, все источники и ID из каталога.

- M3.4 review: найден P2 в оценке — корректный intent ошибочно штрафуется за no_results после фильтров. Исправляет исходный автор с регрессионным тестом; live comparison не запускался. Production build/NFT root PASS (6 traces,1565entries), приватные исходники сборщика не попали в сборку.

- **M3.3 done:** два P2 исправлены с17 assertion RED →135 core GREEN; независимый re-review PASS. Root266 combined tests, full types/lint/default disabled eval PASS. Серверный POST готов; следующий шаг — M3.4 review и подключение UI (M3.5). Платных вызовов0; пользователь подтвердил продолжение со stubs.

- M3.3 review требует2исправления: обязательная тишина могла стать предпочтением; правильный evidence ID не предотвращал противоположный смысл prose. Исправляет исходный автор с RED-регрессиями. Утверждён внутренний тип GeneratedItems как validated item array; raw LLM envelope/HTTP не меняются, документы выравниваются.

- M3.3 implementation готов:116owned tests/scopedTS/lint PASS; independent review начат, каталог не изменён. M3.4 зафиксировал RED на отсутствующем runner и реализуется отдельно. Общие gates — после остановки обоих writers.

- **M3.2 done:** remote-ref P2 ADDRESSED, независимый spec/quality PASS; root50changedadapter tests/scopedTS/lint/diff PASS, прежний153subset PASS, executor162targeted PASS. Параллельно начинаются M3.3 core API и M3.4 eval runner — разные owned files, оба зависят только от принятого adapter. Платные вызовы выключены.

- M3.2 review: найден1P2 — remote $dynamicRef обходит запрет внешних schema refs. Передано исходному автору с RED-регрессиями; остальные проверенные money/deadline/retry пути без замечаний. Платных вызовов0.

- M3.2 implementation готов: root153targeted tests (41adapter/62budget/50index), scopedstrictTS/lint/diff PASS; независимый review идёт. Полный API-suite и сборку проверим после M3.3 — core modules пока отсутствуют.

- M3.2 RED: отсутствующий adapter module и2assertion-level transport failures (pre-abort/expired deadline всё ещё отправляли запрос). Исправляются в совместимом transport extension, прежние60budget tests сохранены.

- Пользователь подтвердил: ключ ещё не обновлён, продолжать со stubs. Повторной auth-проверки/платных вызовов не делаем; OpenRouter$0, демо$4 сохранён. Продолжаем все независимые offline задачи.

- **M3.1 done:** независимый review spec/test quality PASS; root подтвердил preimplementation RED (110 объявленных случаев,0исполненных assertions из-за отсутствующих modules). M3.2 начинает guarded JSON adapter с тайм-аутами/abort/учётом повторов; core после его acceptance.

- M3.1 actual RED подтверждён root:4suite failures из-за отсутствующих production modules, assertions ещё не выполнялись. Добавлены110сценариев intent/grounding/recommend/route; независимый review проверяет сами тесты перед адаптером.

- **M2.5 done (offline acceptance), commit57ce0f2**: root256unit/types/lint/build/NFT/harness/diff PASS. Настоящий индекс/semantic gate M2.4 остаётся blocked; preview403. Начат M3.1: реальные RED-тесты upstream/grounding/route перед API-реализацией. Исходники сборщика сохранены untracked отдельно.

- **M2.4 implementation принят:** все3P2 ADDRESSED, независимые spec/quality PASS; root256tests/types/lint/build/NFT PASS. Сам M2.4 = blocked: настоящий индекс не создан из-за401. M2.5 проверяет offline этап и продолжение со stubs по прямому разрешению пользователя; live качество не объявляется готовым.

- M2.4 fix1: все3 замечания воспроизведены assertion-level RED (4ошибки на временных synthetic данных). Идёт исправление; реальный каталог и бюджет не затронуты.

- M2.4 review нашёл3P2: недостижимый semantic eval, риск перезаписи env-каталога и потерю embeddings завершённого батча при последующем сбое. Исправления переданы исходному исполнителю с регрессионными тестами. Платных вызовов по-прежнему0.

- M2.4 implementation: root234tests/types/lint/build/NFT PASS; no index/cache written. Independent review идёт. Frozen lexical eval exit1:11/12top3, Recall5macro88.33%/micro81.25%, negatives4/4/hardconstraintsPASS. Semantic/live acceptance не выполнен.

- M2.4 RED зафиксирован: index/runtime+runner ещё отсутствовали; реализация идёт. Runtime metadata согласовано как semantic/lexical+warnings+canonicalSnapshot, чтобы UI честно показывал фактический режим.

- **M2.3 done:** persistentguard+guardedtransport; P1diskfailure fixedRED→GREEN, reviewPASS. Root206tests/typecheck/lintPASS; budget60tests. Paidmodeoff, realledgerнеинициализирован, key401/$0. M2.4 starts versionedindex/cache + lexicalmetadata/evalrunner, no actual paidindex.

- Дополнительная проверка M2.2 на реальном каталоге: все16 hard-filter sets совпали с независимой разметкой, exit0. Semantic oracle критерии в поиск не передавались.

- **M2.2 done:** root200unit/types/lintPASS, independent review+6edgeprobesPASS. **M2.3 ещё in_progress:** review P1 diskcommitfailure unlocks unknowncost; originalexecutor fixes with transientI/O regression before acceptance/anypaidcalls.

- **M2.1 done:** root reproduces RED absentgeo/rank; independent testsreviewPASS. M2.2 starts implementation of previously written behaviorcases; real labels frozen.

- M2.3 RED зафиксирован перед реализацией spend guard; прежние88tests PASS. Внутренний RankingContext согласован с intent/сервернымnow для корректного visitMinutes; HTTP не принимает scores/подмену времени.

- Исправлена несогласованность tracker: M1.1 остался todo/empty evidence при существующем source commit и сохранённых PASS reports. Запись восстановлена по проверенным артефактам; добавлена обязательная parent/children/dependency integrity сверка после обновлений, без повторной реализации.

- **M1 завершён**, stage commit `10f4981`. Integrated root gates всеexit0 (88unit/26e2e); collector originals сохранены отдельно без автоматического коммита. **M2.1/M2.3 in_progress:** параллельно search behavior tests и persistent budget guard, без paid calls.

Этап 1 прошёл интеграционные проверки и независимые task reviews.
Созданы Next16.4.2/React19.3.1/TypeScript strict/Tailwind, pinned Node24.21.0 и
pnpm11.0.8, lockfile/CI, Zod-контракты/импорт и доступные UI primitives.
Shell адаптивен на390/1440, geolocation только по нажатию, отказ/поздний callback
оставляют ручной выбор; отмена устаревших запросов и маркировка synthetic проверены.
На момент приёмки этапа1 backend ещё отсутствовал; browser responses того этапа —
route mocks. Текущий M3 API проверен отдельно, актуальное состояние выше и в трекере.

Реальный Catalog: **298 POI**,591 краткая выдержка,7категорий/6исходных районов.
Проверенный срез36 покрывает3категории/3района. Все298цен неизвестны,3rating и6hours
неизвестны; facts не выдуманы. Три suspected duplicate пары сохранены раздельно.
SHA256: `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`.
[Приёмка](collection-import.md), [labels](evaluation-labels.md):12RU positives и4negative
source-first cases; независимое пересчитывание всех16sets/32source refs совпало.
Это development set, ещё не результат retrieval eval.

Исходники и данные сборщика сохранены, не перезаписаны и не включены автоматически
в scaffold commit. Paid collection повторно не запускалась. Raw/normalized/private,
collector scripts и env исключены из production NFT. Реальный regression checker
сначала нашёл114лишних assets, после исправления pageNFT254→139files; каталог включён.

## Проверки этапа 1

Все app-команды выполнены под Node24.21.0:
`env PATH=/Users/macbook/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH pnpm <command>`.

- `pnpm lint`, `pnpm typecheck` — exit0.
- `pnpm test` — exit0,88tests/3files.
- `NEXT_TELEMETRY_DISABLED=1 pnpm build` — exit0, без dynamic-filesystem warning.
- `pnpm check:build-artifacts` — exit0,5production NFT/1438entries; required catalog есть.
- `pnpm test:e2e tests/e2e/search-shell.spec.ts` — exit0,26tests/390+1440.
- `python3 scripts/check_harness.py`, `git diff --check` — exit0.
- Документированный Node-validator реальных labels — exit0,16requests/source/hash assertions.
- Независимый reviewer: M1.1/M1.2/M1.2a/M1.3/M1.4/M1.5 spec+quality PASS.
  Единственный P2 duplicate facts.key исправлен regression RED→GREEN и re-review PASS.

Скриншоты: `output/playwright/search-shell-{desktop,mobile}.png` (локальные QA artifacts).
CI записан, удалённо не запускался. Физический телефон и live-модель не проверены.

## Расходы и внешний блокер

OpenRouter учтено **$0** платных project calls; баланс аккаунта не подтверждён.
Read-only `/api/v1/key`/`credits` вернул401: ключ присутствует server-side, но недействителен.
Значения не выводились; исправлена только несекретная APP_DATASET_PATH с отсутствующего
файла на принятый каталог. Offline/stub разработка продолжается.

Лимит подготовки/индексации/тестов/повторов$2, live-eval$0.50 внутри него, демо$4
сохранены. Persistent single-host spend guard принят в M2.3 после fault-injection fix/review;
paid mode выключен, serverless paid запрещён. См. [budget.md](budget.md). Public model metadata
проверена без ключа; старые исследования не повторялись.

## Текущий следующий шаг

M3.1–M3.5 проверены offline. Следующий шаг — M4 labels/retrieval quality,
затем M5 профили/подробности/маршруты.
M2.4 actual index и M4.3 live comparison остаются зависимыми от ключа/бюджетных gates.
Недействующий ключ не блокирует независимую offline-разработку; live gates остаются честно незавершёнными.
MVP не объявляется рабочим P0 по наличию shell или одной сборке.
