# Состояние проекта

Stage: implementation

Дата: 20.10.2026, Asia/Almaty. План утверждён; повторное согласование не требуется.
Текущие статусы/следующий шаг — [tracker.yaml](../tracker.yaml).

## Выполнение MVP

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
сохранены. Spend guard ещё предстоит M2.3 до любых paid calls. Public model metadata
проверена без ключа; старые исследования не повторялись.

## Следующий этап

M2.1→M2.2: поведенческие тесты и детерминированные фильтры/ранжирование.
Параллельно M2.3: persistent spend guard. Затем индекс/lexical fallback и backend.
MVP не объявляется рабочим P0 по наличию shell или одной сборке.
