# Состояние проекта

Stage: implementation

Дата: 20.10.2026, Asia/Almaty. План утверждён; повторное согласование не требуется.
Текущие статусы/следующий шаг — [tracker.yaml](../tracker.yaml).

## Выполнение MVP

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
Backend/RAG ещё отсутствует; успешные browser responses на этапе1 — route mocks.

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

## Следующий этап

M2.1/M2.2/M2.3 проверены; M2.4 реализует индекс/кеш/lexical fallback и runner.
Далее M2.5 acceptance и M3 текстовый API с явно выбранным demo parser без платных вызовов.
Недействующий ключ не блокирует независимую offline-разработку; live gates остаются честно незавершёнными.
MVP не объявляется рабочим P0 по наличию shell или одной сборке.
