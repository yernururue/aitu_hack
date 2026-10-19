# Состояние проекта

Stage: implementation

Дата: 20.10.2026, Asia/Almaty. План утверждён; повторное согласование не требуется.
Статусы и следующий шаг — [tracker.yaml](../tracker.yaml). Полная история task evidence
сохранена в трекере; этот файл — короткая передача текущего состояния.

## Выполнение MVP

Проверенный offline/stub текстовый путь работает на 298 реальных POI: фильтры,
лексическое ранжирование, серверный API, адаптивный UI, подробности/источники,
демо-профили, локальные сохранения/скрытия/сброс, 2ГИС и Google Maps walking/driving.
Новые браузеры не получают профиль автоматически; текущие условия важнее истории.
История хранит только профиль и ID, без запросов/координат/аудио.

M1/M3 приняты, M2 offline code принят; M4.1/M4.2 numerical gate принят;
M5.1/M5.2 приняты после независимого review. Последний UI P2 исправлен:
HTTP provenance остаётся точным текстом, HTTPS — кликабельной ссылкой; RED2anchors →
GREEN2viewport cases, независимый probe/re-review PASS. Голос M6 skipped по P1 gate,
записи/транскрипции нет. M7 release work продолжается по явному offline waiver.

## Последние проверки интегратора

Все команды под Node24.21.0/pnpm11.0.8; платные режимы явно выключены.

| Команда | Результат |
|---|---|
| `python3 scripts/check_harness.py` | exit0, документы/fixtures/ссылки |
| `pnpm lint` | exit0, без предупреждений |
| `pnpm typecheck` | exit0, Next typegen + strict TS |
| `pnpm test` | exit0, 554 теста /16 файлов после финального UI fix |
| `APP_AI_MODE=stub OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false pnpm build` | exit0, production |
| `pnpm check:build-artifacts` | exit0, 6 NFT traces/1568 entries; каталог включён, raw/private/env/collector tooling исключены |
| `pnpm test:e2e` | exit0, 62/62 за25.0s, 390/1440 Chromium, после финального fix |
| `pnpm eval:retrieval` | exit1 ожидаемо: numericalPASS, semanticVerified=false/acceptancePassed=false |
| `LIVE_EVAL_ENABLED=false pnpm eval:live` | exit0, disabled, 0rows/0network/0cost |
| `git diff --check` | exit0 |

Browser покрывает настоящий локальный API/каталог: 0–3 валидных ID, snapshot,
источники, строгие unknown budget/facts, unknown query/conflicts, loading/errors,
профили/history/reset/persistence failures, race/abort, denied/late geolocation,
focus trap/restoration/Close и отсутствие горизонтального скролла. Scoped mocks
используются только для гонок/отказов и явно synthetic literal-HTML review fixture.
Root просмотрел реальные desktop/mobile скриншоты карточек и подробностей.
Разбор href не подтверждает физический телефон или запуск native карт.

## Данные и качество

Каталог synthetic=false:298 POI,591 короткая буквальная выдержка отзывов,
889 provenance records,7категорий. Проверенный срез36:3зоны/3категории.
Сбор19.10.2026 18:24:24–18:35:43UTC; normalized snapshot18:41:06.854110UTC.
File SHA256 `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`;
canonical runtime snapshot `4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6`.
Все298 price/facts неизвестны. Оригинальный collector/package/снимки сохранены;
raw и пользовательские данные не коммитились. Права публикации review text не установлены.

Frozen12RU positives:top3=12/12, macroRecall5=.9722222222, micro=.9375;
4negative отдельно4/4, hardPASS. Macro denominator ровно12, не16.
Это agent-curated development labels, не независимый blind benchmark.
RAGOps supplemental сравнение baseline.8833333333→.9722222222 (+8.89pp) PASS;
semantic/citation/live качество этим не подтверждается. Дополнительные4KK отдельно:
4/4top3/.9166666667; native-speaker/liveKK не проверены. См. [решение по моделям](model-decision.md).
Приватные eval receipts — ignored `output/evaluation/`; модели реальным данным не вызывались.

## Внешние блокеры и расходы

M2.4: настоящий embedding index отсутствует. M4.3/M4.4: live comparison/выбор модели
не выполнены; actual model=null, Luna provisional. Ключ401; пользователь подтвердил,
что не обновлял его и поручил продолжать со stubs. Auth/paid retries не выполнять.
Haiku conservative reserve$1.32>$0.50 eval cap; лимиты не повышены.
M5.3: физический телефон/native map handoff и один реальный paid smoke не проверены.
Это не полная P0 RAG acceptance. Vercel session preflight403, нового login не было;
временный QuickTunnel подготовлен, публичный URL пока не создан/не проверен.

OpenRouter учтённый расход проекта$0; баланс аккаунта не проверен.
Persistent guard (concurrency/reservation/usage/crash/failure) проверен независимо;
paid выключен, реальный ledger не инициализирован. $2prep включает$0.50eval,
$4demo reserve сохранён; serverless paid запрещён. Apify — отдельный ранее
разрешённый сбор, его бюджет/collector tracker не изменялись.

## Сохранённые этапы

`10f4981` M1; `57ce0f2` M2 offline; `fd37acb` M3 offline;
`0a6b53a` M4 labels/lexical. M5 offline feature snapshot сохраняется перед M7.
Дедлайн20.10.2026 23:59, внутренняя цель20:00 Asia/Almaty.
