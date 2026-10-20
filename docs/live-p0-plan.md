# Real AI / RAG P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Интегратор назначает исполнителя и другого reviewer с разными owned files; tracker пишет только интегратор.

**Goal:** Завершить оставшиеся реальные AI/RAG gates M2.4 → M4.3 → M4.4 → M5.3 без потери работающего stub и без превышения разрешённых расходов.

**Architecture:** Использовать существующие каталог, индекс/hash-cache, guarded OpenRouter transport, strict intent/explanation и UI. Сначала получить реальные измерения и исправлять только обнаруженные блокеры с RED → GREEN, без новой архитектуры. Публичный live включать после semantic retrieval, явно утверждённой квалификации модели и валидного выбора; до этого публичный stub сохраняется.

**Tech Stack:** Node 24.21.0, pnpm 11.0.8, Next 16.4.2 / React 19.3.1, TypeScript strict, Zod 4.6.7, файловые POI/index/cache, OpenRouter, Vitest / Playwright.

**Spec:** [product-spec.md](product-spec.md), [data-contract.md](data-contract.md), [исходный план](implementation-plan.md) M2.4/M4.3/M4.4/M5.3, [budget.md](budget.md), [indexing.md](indexing.md). Статус: [tracker.yaml](../tracker.yaml); контекст: [handoff.md](handoff.md), [progress.md](progress.md).

## Действующее уточнение 20.10, 19:49 Asia/Almaty

Пользователь разрешил третий exact budget bound $0.384750001 (actual=null),
live-eval $1.50 внутри prep $2/demo $4 и Qwen на всех 12×2=24 этапах.
Haiku/Azure и Luna не прошли текущие технические условия; их полная семантика
не измерена. Исходные72 и48 incomplete, Qwen24 имеет отдельную qualificationflag.
Три bounds применены/audited, v4. Новый Qwen429 без стоимости снова STOP;
четвёртого разрешения нет. Критерии качества и независимое ревью сохраняются.
Предыдущие утверждения и исходный план ниже — исторический журнал;
действующий статус/остатки — [tracker](../tracker.yaml) и [handoff](handoff.md).

## Предыдущее утверждённое изменение20.10, 19:19 Asia/Almaty

Пользователь прямо разрешил второй budget upper bound$0.264 (actual=null),
live-eval$1 внутри прежнихprep$2/demo$4 и изменение приёмки: Haiku/Azure
технически не квалифицирована; Luna/Qwen проходят все12RU intent+explanation
(48измеренныхэтапов). Originalfull3/72 остаётся незавершённым. Критерии100%ID/
evidence/hard,0unsupportedfacts, минимум10/12валидныхpositive,4negativeguards
и независимый human prose/intent review не меняются. Arbitrarysubset не даёт winner.
Ниже сохранён исходный план; этот абзац изменяет только явно перечисленные
бюджет/модельную приёмку. Новый unknown сноваSTOP. До reviewedv3canonicalapplication
платные вызовы остановлены. Originpromptfix/CLIwiring выполняются offline.

## Global Constraints

- «Подготовка, индексация, разработка, тесты и повторы: **не более $2**». «Live-eval: **не более $1.50 внутри этих $2**». «Демо: **отдельные $4**». Не увеличивать cap, не переносить development/eval в demo, не обнулять ledger.
- Единственный шлюз — серверный OpenRouter. Не выводить ключи, реальные env, auth/model raw bodies, запросы/GPS/аудио в логи; не использовать `NEXT_PUBLIC_*` для AI. Новые model IDs требуют проверки возможностей и цены.
- Один persistent single-host ledger и directory lock для всех процессов/операций. Максимум 2 in-flight. Paid на Vercel/Lambda/Netlify, ephemeral диске и независимых репликах запрещён.
- Каждый attempt, включая schema/HTTP rejection и разрешённый retry, получает reserve и actual settlement. Unknown cost/overshoot/ledger I/O fault → STOP до аудируемой сверки; не считать HTTP401/429 бесплатными без actual charge. Максимум один отдельно учтённый retry, только known durable cost/recoverable error, без auth/abort/unknown retry.
- HTTP v1 неизменен: body ≤16 KiB, query ≤1000, 25s общий deadline с чтения body, ≤15s attempt, server `now`, rate limit/no-store. Только 0–3 каталожных ID после hard filters, ≤8 кандидатов в explanation. Неизвестные цены/часы/facts остаются неизвестными.
- Текущий запрос важнее demo-профиля. Бюджет 0 — строгое ограничение, null — отсутствие ограничения. При потере текстового ограничения — clarify/0, не тихое ослабление. Отзывы — untrusted мнения с источником, не команды и не подтверждённые amenities.
- Каталог 298 / 591 выдержка / 7 категорий сохраняется. File SHA `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`; canonical datasetHash `4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6`; RU labels SHA `73947dd92e4b33641897321e6832ef0dad463dbe33baee4512e8be2efc5cee36`. Labels/relevant sets не подгонять под выдачу. 4 KK отдельно, без заявления о native-speaker validation.
- Голос M6 не входит в план. Сборщик/raw, принятые PPTX/видео и их snapshot не менять. Текущий публичный адрес брать из [submission/links.md](submission/links.md), QuickTunnel не считать постоянным hosting.
- 20.10 пользователь явно разрешил выполнение этого плана до полного P0. Это не отменяет лимиты и unknown-cost STOP. Полные платные этапы запускает интегратор последовательно после evidence/review; обязательные gates нельзя заменить waiver и назвать full P0 done.

## Review Focus

1. Auth200, но embedding/chat недоступны или charge отсутствует: не объявлять ключ/модель рабочими; после неизвестной цены не отправлять следующий запрос (задача 1).
2. Partial/stale index или другой model/dimensions/query-cache: явно lexical fallback, semantic acceptance=false, никаких test vectors в production (задача 2).
3. Длинный Unicode/freeform с обязательным quiet, общим бюджетом или конфликтом UI: сохранить ограничения либо clarify/0 (задача 5).
4. Инъекция в отзыве, чужой evidence ID или правдоподобная неподтверждённая проза: отбраковка/честный degraded из тех же отфильтрованных POI (задачи 4–5).
5. Перезапуск/две сессии/ошибка записи или смена runtime env после stub-build: прежний ledger, без позднего send/reset, а HTML/клиент честно отражают текущий серверный режим (задачи 1, 3, 6).

---

## Историческая проверка обновлённого ключа M2.6

На момент составления плана задача проверки — **M2.6**, ограниченная кампания максимум3POST, а не новый будущий тест из этого плана. Один auth GET HTTP200 в `2026-10-20T09:50:05Z`. Первый one-use batch уже выполнил один query_embedding POST HTTP200 в `10:01:43Z`, затем остановился на model alias mismatch. Embedding не повторять. Отдельный проверенный chat-only driver завершил два оставшихся diagnostics в том же ledger: intent и explanation HTTP200, schema/evidence PASS. Всего3POST, расход$0.00024488. Старый401 — история. Значения ключа и auth response в документ не переносить.

| Проверка | Результат на момент плана |
|---|---|
| Авторизация нового ключа | HTTP200, сообщение интегратора, время выше |
| Metadata текущих настроенных chat/embedding моделей | Найдены, ставки получены в redacted preflight; это не полный3-model comparison |
| Новый key-specific local scan / guard tests | 2known sources,131files/59ZIP members,findings0;62budget tests PASS, evidence интегратора |
| Первый guarded query embedding | HTTP200, provider OpenAI, responseModel `text-embedding-3-small`; requested `openai/text-embedding-3-small`; STOP на exact-name mismatch **до проверки1536** |
| Учёт первого POST | Known settled$0.00000018,9tokens; canonical ledger впервые создан0600, uncertain=false/inFlight0/reserved0 |
| Итоговый остаток после кампании3POST | prep$1.99975512 / live_eval$0.49975512 / demo$4; uncertain=false/inFlight0/reserved0 |
| Guarded intent400 и explanation1000 на реальном POI | Отдельный `smoke-chat-only.mjs`: HTTP200, GPT‑6 Luna/OpenAI; intent541tokens/$0.0001065/4026ms, explanation714tokens/$0.0001382/3624ms; strict schema и same-POI evidence PASS |
| Полный smoke /1536/index /выбор модели | **Не доказаны**; новый индекс не создан, model selection PENDING |

Результаты приняты из фактических receipts и канонического ledger. Кампания завершена: оба one-use driver не повторять ради этого документа. HTTP200 и known charge доказывают оплаченный ответ endpoint, но не прошедший embedding protocol/1536/RAG. Текущие проверенные 554 unit /64 e2e относятся к offline UI; автор плана их и62budget tests не повторял.

## Карта существующих файлов

| Участок | Уже имеющиеся файлы / интерфейсы |
|---|---|
| Индекс | `src/lib/search/index.ts`: `prepareDocuments`, `buildIndex`, `validateIndex`, `validateQueryCache`, `createGuardedEmbedder`; `scripts/build-index.ts`: atomic checkpoint / path protection |
| Retrieval eval | `scripts/eval-retrieval.ts`: `evaluateCases(catalog,cases,deps)`, `summarizeRetrieval`; `deps.index/queryCache/embed/checkpointQueries` |
| Биллинг | `src/lib/ai/{config,pricing,budget,ledger,transport}.ts`: `quoteRequest`, `BudgetGuard`, `GuardedTransport.execute`, `createLiveTransport` |
| AI / model eval | `src/lib/ai/{openrouter,explain,validate}.ts`, `scripts/eval-live.ts`: `ChatJson`, `createChatJson`, `runLiveEvaluation(options,deps)`, `freezeLiveCases` |
| Runtime / HTTP | `src/lib/search/intent.ts`: `configuredAiMode`, `parseIntent`; `src/lib/recommend.ts`: `recommend(input,deps)`, `createRecommendHandler`; `src/app/api/recommend/route.ts` |
| Production assets | `next.config.ts`, `scripts/check-build-trace.mjs`; сейчас tracing включает только каталог, не настоящий индекс |

Платные команды далее разрешаются только после соответствующего preflight/review. Их env-переключатели действуют на один процесс, `.env.local` не меняют; staging/worktree обязаны использовать указанный прежний абсолютный ledger, без новой инициализации.

Дальнейшие файлы в задачах — будущие owned files, а не выполненные изменения. Новые зависимости не нужны по умолчанию. Все RED tests используют injected providers и временные ledger, без сети.

## Задача 1 — текущая M2.6: принять первый receipt и оставшиеся chat diagnostics

**Files:** существующий приватный `/tmp/aituhack-mvp/live-key-check-20261020/smoke.mjs`, его `auth.json`, `fresh-secret-scan.json`, `dry-plan.json`, уже полученные `ledger-init-receipt.json`/`smoke-results.json`; отдельный `smoke-chat-only.mjs`/`chat-smoke-results.json` и `campaign-report.md` уже получены. `docs/budget.md`, `src/lib/ai/{config,budget,transport}.ts` только читать. Не создавать второй embedding driver и не менять source для повторения первого batch.

**Interfaces:** operator использует существующие `BudgetGuard`, `quoteRequest`, `GuardedTransport.execute({purpose:"live_eval",quote,body,deadlineAt,signal,timeoutMs:15000})` и локальные `once`/`chatOnce` wrappers, **не retry loop `createChatJson`**. `parseIntent` и `explain` получают `chatJson:chatOnce` и тот же deadline. Исходная кампания: один уже выполненный `query_embedding` контролируемого «Хочу погулять» с requested1536, затем максимум один intent400 и один explanation1000 по реальному отфильтрованному POI. Первый batch остановился до vector validation/chat; новые chat-only diagnostics не повторяют embedding. Всё — **live_eval внутри prep**, не prep index-document test и не demo.

- [x] Принятые от интегратора preflight facts: один auth200 GET, metadata текущих chat/embedding найдены/ставки получены; свежий new-key-specific local scan2sources/131files/59ZIP/findings0 и62budget tests PASS. Эти факты не являются результатом paid POST и не разрешают повторный auth.
- [x] Исходный one-use operator подготовлен и использован: максимум3POST, максимум1 на операцию, concurrency1, retries0,15s attempt/25s общий, caps2/.50/4. Первая операция учтена до protocol validation; chat0. Выполнение всех трёх не гарантировалось одной суммой quotes.
- [x] Root/автор выполнил первый approved запуск. Его entrypoint `node --import tsx /tmp/aituhack-mvp/live-key-check-20261020/smoke.mjs --execute-root-go` теперь **историческая, не повторная команда**. Exclusive `execution-started.json` (`wx`) запрещает rerun; canonical ledger впервые создан0600. Marker/ledger не удалять, лимиты не переинициализировать.
- [x] Первый receipt принят: query_embedding HTTP200/known settled$0.00000018/9tokens, OpenAI native response name вместо requested slug; STOP до1536 validation. Ledger healthy, uncertain=false/inFlight0/reserved0, остатки приведены выше. Это protocol failure, не успешный full smoke и не неизвестная стоимость.
- [x] Отдельный root GO после независимого review SHA разрешил ровно два оставшихся chat diagnostics: intent400 и explanation1000. Driver требует неизменные receipts первого POST, тот же здоровый канонический ledger и campaign total≤3; no init/reset/embedding/retry. Оба HTTP200 и локальные schema/evidence проверки PASS, cost записана до parsing. Это отдельный operator batch со своим25s deadline, не измерение полного RAG-пути.
- [x] Интегратор сверил receipts с фактическим ledger:3settled entries,244880nanoUSD/$0.00024488 внутри prep/live_eval, unknown/inFlight/reserved0, demo$4. Embedding1536 validation и fullRAG не доказаны; alias blocker вынесен в задачу2.

**Acceptance:** честные receipts M2.6: первый1POST protocol STOP и два отдельных успешных chat diagnostics; total3POST без retry/дубликата embedding, known charges сверены с ledger. Дальнейшие задачи используют тот же ledger и все уже списанные суммы, не заводят новый «тест ключа». Full smoke/index/RAG success не заявлен.

## Задача 2 — M2.4 и semantic gate M4.2: настоящий индекс и query cache

**Files:** уже готовы `scripts/{build-index,eval-retrieval}.ts`, `src/lib/search/{index,retrieve}.ts`, `tests/unit/index.test.ts`; outputs `data/index/{places,cache,query-vectors}.json` (ignored), приватный retrieval JSONL. Не менять каталог/labels.

**Interfaces:** `buildIndex(catalog,{model,dimensions,cache,embed,checkpoint})`; `IndexSchema` / `validateIndex` требуют полный набор IDs; query cache привязан к `rawQueryHash(originalQuery)`, model/dimensions/canonical datasetHash.

- [x] **Подтверждённый blocker до индексации:** `createGuardedEmbedder` в `src/lib/search/index.ts` сейчас сравнивает `response.model !== options.model` (строка138 на момент receipt). Сначала RED в `tests/unit/index.test.ts`: verified pair requested `openai/text-embedding-3-small` / native `text-embedding-3-small` принимается так же, как точный slug; unknown/different model, чужой namespace, неправильная размерность, partial/duplicate/missing response vectors отвергаются. Не утверждать1536 PASS по первому M2.6 receipt и не получать второй embedding ради теста.
- [x] Минимальный pure allowlist в существующем index module, например `isAcceptedEmbeddingResponseModel(requested:string,actual:unknown):boolean`, сначала требует известный проверенный requested slug и принимает только его точное имя либо явно проверенную пару; никаких generic strip-prefix/suffix/lowercase aliases. После совпадения модели сохраняются все текущие vector count/index/dimension/finite/nonzero проверки. `pnpm exec vitest run tests/unit/index.test.ts` → GREEN на synthetic response fixtures, затем независимый review alias/protocol fix **до** первого full index batch. Billing/ledger/transport не ослаблять.
- [x] Offline dry run: `pnpm build:index` → 298 коротких source-derived документов, ожидаемые 45770 UTF-8 bytes, no network/write. Документ ≤4000 bytes, без URL/отзывов/raw, версия `poi-v1`. Если числа изменились — сначала выяснить drift, не перезаписывать принятый snapshot.
- [x] После отдельного GO/full-batch budget preflight: `OPENROUTER_PAID_ENABLED=true OPENROUTER_STORAGE=single_host_persistent OPENROUTER_LEDGER_PATH=/Users/macbook/Yernur/projects/aituhack/data/private/openrouter-budget.json node --env-file=.env.local --import tsx scripts/build-index.ts --execute` → через prep guard только missing unique document hashes, default batch32, validated checkpoint+fsync до следующего batch. Учитывать цену первого теста; cache возобновлять, не оплачивать завершённые документы снова.
- [x] Проверить `validateIndex(raw,catalog,{model:"openai/text-embedding-3-small",dimensions:1536})`: ровно298 уникальных каталожных IDs, finite ненулевые vectors, canonical hash выше; документ/cache model/version совпадают. Совместимость модели подтвердить metadata до исполнения, не брать её из выдуманного ответа.
- [x] Подготовить недостающие raw-query vectors: `LIVE_EVAL_ENABLED=true OPENROUTER_PAID_ENABLED=true OPENROUTER_STORAGE=single_host_persistent OPENROUTER_LEDGER_PATH=/Users/macbook/Yernur/projects/aituhack/data/private/openrouter-budget.json node --env-file=.env.local --import tsx scripts/eval-retrieval.ts --prepare-queries` с `LIVE_EVAL_ENABLED=true`; расход **live_eval внутри prep**, каждый checkpoint durable. Учесть его в остатке$0.50 до model comparison. При checkpoint failure следующий paid batch запрещён.
- [x] Повторить **без сети** `pnpm eval:retrieval` → все12positive `mode=semantic`, top3≥10/12, macroRecall@5≥0.90, все hard constraints и4negative PASS, `acceptancePassed=true`, exit0. Отдельные4KK не добавлять в RU denominator. RED для несовместимого/частичного index/cache и GREEN уже существуют; новые писать только на найденную регрессию.

**Acceptance:** сохранён реальный проверенный индекс и query-cache, exact model/dimensions/hash/actual charge/reuse counts в receipt. Численный lexical PASS не закрывает semantic gate. При непрохождении — diagnosis без уменьшения relevant sets, stub остаётся доступен.

## Задача 3 — M4.3: допустимый reserve, без обхода cap

**Files (только при реализации доказанного исправления):** `src/lib/ai/{pricing,transport,openrouter}.ts`, `scripts/eval-live.ts`, `tests/unit/{budget,openrouter,eval}.test.ts`, `docs/budget.md` у интегратора.

**Принятое уточнение реализации20.10:** исходный broad-route Haiku reserve$1.32,
затем консервативная endpoint correction$1.42 действительно превышали$0.50.
Полного доказанного payload-token bound не найдено; `quoteChatPayload` не внедряется.
Вместо него сохранены full context/output bounds и принудительный потолок тарифа
для точного `azure/global`. Официальный контракт OpenRouter `max_price` задаёт
предел оплачиваемой ставки и отказ при недоступной цене. Для Haiku .10/.50M caps,
наибольший документированный2xcache-write и full1M/128k дают reserve$0.264.
Luna$0.384750001, Qwen$0.26160384. Нет предположений о byte/token ratio или скидках.

- [x] Проверены публичные20.10 model+endpoint metadata, все context/cache tiers,
  точный Haiku endpoint/requiredparams, неизменяемые issued quotes и no fallback.
- [x] RED→GREEN: upward endpoint-cache correction6d02803 и fixedlowcap route3d92116;
  author154tests/lint/strictTS PASS; independent41focused +actual3API snapshots PASS.
  Issuer/body whitelist не допускают caller model/provider overrides; весь framing/schema/
  reasoning покрыт полными границами. Unknown/overshoot/durable-I/O STOP сохранены.
- [x] Independent SPEC/QUALITY PASS принят для rate-ceiling contract и реализации.
  Body hash не нужен для full-context quote, поскольку граница не зависит от текста.
- [x] Подключить accepted `verifyQuoteMetadata` к actual CLI/preflight, сохранить
  same-candidate comparison/strictcorevalidation и подтвердить свежие combined tests.
  Проверять remaining prep/live_eval перед каждой попыткой и actual после неё.
  Гипотетическая сумма всех максимумов не обещает завершение; при нехватке headroom
  остановить неполный прогон, не брать demo/не выбирать subset. Это исходное правило
  бюджета; предлагаемое ранее sum-of-entire-run условие не вводится.

**Acceptance:** все три модели допускаются по проверенной оценке и оставшемуся бюджету либо M4.3/M4.4 честно blocked. Повышение$0.50/$2, изменение model list или диагностический subset не закрывают этот gate.

## Задача 3a — M4.3a: разрешённая политика верхней оценки

Пользователь20.10 прямо разрешил бюджетную верхнюю оценку$0.264 для единственной
неизвестной попытки и eval$0.80 внутри прежнихprep$2/demo$4. Authorization
`c8e3d04e-7df9-4482-aabc-2338c4895b49`, targetreservation
`ff7460a9-cf70-4248-8cd7-def9fcc5770e`. Это исключение из прежнего unknownSTOP,
не доказанная фактическая цена. Новыеunknown снова останавливают вызовы.

**Files:** `src/lib/ai/{config,ledger,budget}.ts`, budget/runtimepurpose unit tests;
rootowns AGENTS/spec/harness/budget/envexample/tracker. Реальныйledgerне менятьдоreview.

- [x] RED→GREEN/versioned v1→v2 сохранение всех27knownentries/history; targetactualnull,
  explicitauthorized_upper_bound/budgetCharge.264/auditRef/time, countedonceprep+eval.
  Единственный exactgrant поднимает persisted eval.50→.80; обычныйenv/constructor
  не повышает v1cap. Prep2/demo4 и futureunknown/overshoot/durablefailureSTOP неизменны.
  Идемпотентность/crossprocess/mismatchedtarget/caps/tamper/failure regression tests.
- [x] Другой reviewer проверяет source+проверки. Rootоператор применяет exactgrant
  единственный раз к прежнемуcanonicalledger, verifieshistory/actualnull/budgetbasis/
  chargedtotals/caps, затемexplicit audit снимаетbarrier толькопри отсутствии других
  unknown/unsettled/overcap. Никакого settle(.264) какactual/reset/newledger.
- [x] Новый offlinegate, privateoperator/capsule.80 review/freshmetadata/preflight;
  только после source+canonicalreceiptacceptance возобновитьfull3comparison.

**Acceptance:** честный basis/расход/остатки и проверенный прежнийledger; capoverride
сам по себе не завершаетmodelcomparison/qualitygate. Actualcost target остаётсяunknown.

## Задача 4 — M4.3/M4.4: frozen сравнение и валидный выбор

**Files:** `scripts/eval-live.ts`, `tests/unit/eval.test.ts`; при необходимости отдельный `evals/live-intent-expectations.json` (до вызовов, без изменения RU relevant IDs); `evals/results/` ignored; решение `docs/model-decision.md` у интегратора.

**Interfaces:** `runLiveEvaluation({execute,input:{catalog,cases},models?,outputPath},deps)`; `deps.retrieve`, `createChat({model,onAttempt})`; `freezeLiveCases` и существующие `parseIntent` / `explain` / `validateExplanation`. Raw envelope `{items}` → validated `GeneratedItems` array. Не создавать второй grounding validator.

- [x] Зафиксировать12RU positives и отдельно4negative guards, prompt version, исходные raw queries, index/cache/source hashes. Для intent до получения ответов задать ожидаемые `Intent` и abstention/conflict; текущий optional `expected.intent` иначе оставляет `intentMatch=null`, что не является успешным intent eval. Никакого scoring по одному schemaPass.
- [x] Один раз заморозить≤8 кандидатов/случай из принятого semantic index и cached raw-query vectors через существующий `deps.retrieve`; gold IDs/tags/ожидаемый intent не идут в retrieval/prompt. Current default CLI freeze не подаёт queryVector/embed и может остаться lexical даже при наличии index: сначала pin RED/diagnostic на actual mode; при необходимости тонко подключить локальные index/cache в CLI, без сетевого retrieval внутри model loop.
- [x] RED → GREEN при недостающем wiring: все3модели получают одинаковые contextHash/candidateIds/prompt для explanation; смена gold не меняет context; intent scorer не borrowing explanation status; cache miss/missing intent labels запрещают объявлять полную оценку. `pnpm exec vitest run tests/unit/eval.test.ts tests/unit/index.test.ts` → PASS.
- [ ] Только после задач2–3/full budget GO: `LIVE_EVAL_ENABLED=true OPENROUTER_PAID_ENABLED=true OPENROUTER_STORAGE=single_host_persistent OPENROUTER_LEDGER_PATH=/Users/macbook/Yernur/projects/aituhack/data/private/openrouter-budget.json node --env-file=.env.local --import tsx scripts/eval-live.ts --execute`. Одинаковый context, все `openai/gpt-6-luna`, `anthropic/claude-haiku-5.5`, `qwen/qwen3.8-flash`;12positive×3×intent/explanation=72 logical stages (до144 attempts),4negative отдельно (runner может содержать все16; skipped stages не считать платными успешными измерениями). Headroom проверять до каждого batch/stage, actual ledger после него. Первый unknown/insufficient headroom → STOP и incomplete.
- [ ] В receipt: actual model/responseModel/provider, prompt/context/dataset hashes, schemaPass, проверка каждой прозы по источникам/unsupported claims, intent correctness/abstention, usage/cost/all retries, total latency. `ttftMs=null` у non-streaming runner так и оставить, не выдумывать TTFT. Не логировать raw provider bodies/запросы/ключи; human grounding review использует валидированные why/activity с case ID и первичными источниками, без auth/raw protocol/production logging.
- [ ] Интегратор+независимый reviewer выбирают только прошедшую модель: correctness/grounding → latency → cost. Нужны полный3-model comparison,100% ID/evidence/hard-filter invariants,0 неподтверждённых фактов и релевантный validated результат в top3 минимум10/12positive; все явные текстовые условия сохранены либо безопасный clarify. Непрошедшая схема/degraded или abstain на всех positive не маскируются валидной генерацией. Если все плохи — regression RED на конкретный исход, минимальный prompt/pipeline fix, повтор только с remaining budget. Иначе blocked, winner=null.

**Acceptance:** обоснованный `OPENROUTER_MODEL` и versioned decision с ошибками/ограничениями; не provisional Luna и не «лучший из невалидных». До этого публичный APP_AI_MODE остаётся stub.

## Задача 5 — M5.3: закрытый live путь до публичного переключения

**Files:** существующие `src/lib/{recommend,search/intent,ai/validate,ai/explain}.ts`, `tests/unit/{intent,grounding,recommend,route}.test.ts`, `tests/e2e/recommendation-flow.spec.ts`; менять только подтверждённый live bug. Контракт/изменения UI — через интегратора.

**Interfaces:** `recommend(request,{mode:"live",purpose:"prep",...})`, `createRecommendHandler({recommend})`, тот же общий deadline/signal для intent/query embedding/explanation. Факты/URL/рейтинги/часы и visit bounds дополняет код, не LLM.

- [ ] На закрытом localhost с выбранной моделью проверить настоящий freeform, который не совпадает с5stub-фразами: например «Хочу провести час в парке рядом с EXPO». Проверить actual intent, semantic mode и три каталожных ID/grounding; category-only не требует intent call. Расход этого development smoke — prep, не demo.
- [ ] Pin RED на найденные ошибки, сохранив существующие cases: обязательная тишина/confirmed outlets неизвестны→0/clarify; бюджет0 и2500 при unknown prices→0, null→допустимые места; общий бюджет→clarify; Unicode/неподдержанное ограничение/конфликт explicit UI не исчезают. «Студент» не меняет прогулку на кофе.
- [ ] Проверить злой review/invented ID/cross-POI evidence/amenity prose обеих полярностей; intent failure→clarify0; embedding failure→помеченный lexical с теми же hard filters; explanation failure→degraded только из кандидатов. Нет domain retry, поддельных фактов и скрытого fallback model.
- [ ] `pnpm exec vitest run tests/unit/intent.test.ts tests/unit/grounding.test.ts tests/unit/recommend.test.ts tests/unit/route.test.ts` и обычные deterministic `pnpm test:e2e`390/1440 → PASS. Платные сценарии не в CI/e2e loop: один контролируемый live smoke отдельно с ledger receipt. Abort/25s,slow/chunked16KiB/nonJSON/400/429/no-store остаются безопасны.
- [ ] На закрытом live UI проверить loading/error/empty/details/source URLs/dates/две карты/профиль/history и no horizontal overflow390/1440. Физический доступ/3карточки/обе native-карты уже подтверждены пользователем для stub build; после live cutover повторить выбранный POI на телефоне, не выдавать прежнее подтверждение за новый live smoke.

**Acceptance:** один реальный end-to-end freeform live smoke на настоящем каталоге, known actual charge, без потерянных условий/галлюцинаций. Все обнаруженные дефекты прошли independent review; M5.3 не закрывать одним успешным auth/chat.

## Задача 6 — M5.3/M7.2–M7.3: production assets, purpose и контролируемый cutover

**Files (узкая интеграция):** `next.config.ts`, `scripts/check-build-trace.mjs`; `src/lib/ai/config.ts`, `src/app/api/recommend/route.ts`, `tests/unit/{budget,route,recommend}.test.ts`; runtime-disclosure при найденной регрессии — `src/app/page.tsx`, `src/components/{search-experience,search-form}.tsx`, `tests/e2e/recommendation-flow.spec.ts`; текущие release docs/manifest/tracker у интегратора. Принятые PPTX/видео не пересобирать.

**Interfaces:** `recommend(...,{purpose})` уже server-only. Предлагаемое server-only env `OPENROUTER_RUNTIME_PURPOSE="prep"|"demo"` даёт `readAiConfig().runtimePurpose:"prep"|"demo"`, defaultprep, invalid→configuration failure; route передаёт его через существующий handler/core factory. HTTP body purpose/model/provider/now/index не принимает. Не менять потолки guard.

- [x] RED → GREEN: valid `data/index/places.json` входит в production trace, но cache/query-cache/ledger/raw/normalized/collector/env остаются закрыты; stale/missing production index даёт явный lexical, не semantic claim. Включить только проверенный index asset в tracing/allowlist, не весь `data/index/**`.
- [x] RED → GREEN server purpose: development smoke prep, eval live_eval(внутри prep), actual demo demo. Клиент не выбирает bucket, default остаётся prep, invalid env fail closed; stub/disabled не строят live factories даже при paid flag. Интеграция принята; один APP_AI_MODE=live не разрешает перенос development на demo.
- [ ] После narrow fixes запустить offline gates с `OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:build-artifacts`, `pnpm test:e2e`, `pnpm eval:retrieval`, `python3 scripts/check_harness.py`, `git diff --check` → PASS; `pnpm eval:live` без execute→disabled/0network. Не запускать весь e2e suite против paid-live сервера. Fresh independent review; integrator сразу обновляет оригинальные task IDs/evidence.
- [x] Обязательный localhost production probe в отдельной staging-копии, не перезаписывая `.next` работающего stub: build `APP_AI_MODE=stub OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false pnpm build`; тот же build стартовать `APP_AI_MODE=live OPENROUTER_RUNTIME_PURPOSE=prep OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false pnpm start --hostname 127.0.0.1 --port 3001`. Fresh browser GET должен показывать live freeform hint, без stub notice/пяти phrase-buttons; providerPOST=0. Проверить обратный runtime switch→stub. Текущий `page.tsx` уже делает `await connection()` до `configuredAiMode()` и передаёт aiMode в SearchForm, поэтому статическая ошибка не утверждается. Если probe найдёт stale mode — RED production regression и минимальный fix после чтения `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md` и relevant caching guide. Затем лишь отдельный разрешённый private paid smoke, не платный build.
- [ ] Перед cutover повторить redacted security scan после изменения env/build и проверить private paths404, server-only key, no-store/strictAPI/429, отсутствие query/GPS/key/raw provider body в production logs/client assets. Использовать один постоянный host/ledger/path с оставшимися caps. Не сбрасывать ledger при рестарте и не переносить paid на serverless.
- [ ] Только после M2.4/M4.3/M4.4/закрытого M5.3 PASS интегратор переключает проверенную production-сборку на выбранную live-модель, совместимый index и server purpose demo; development на резерв не переносится. Сохранить доступный stub как rollback, приватные cache/ledger не публиковать. Ограничить публичную частоту и provider/key cap; помнить, in-memory rate limiter не глобальный бюджет.
- [ ] Fresh private browser390/1440 и телефон: новый live freeform→реальные ID/источники/детали/2maps, строгие unknown0, responsive/focus; сверить known charge с ledger. Записать actual build/model/index/hash/checktime/current URL/lifecycle. При unknown/cap/schema/grounding/security failure остановить paid, вернуть явный stub, сохранить ledger и blocker; не скрывать degradation. QuickTunnel остаётся process-bound.

**Acceptance:** full P0=true только при всех обязательных gates PASS с учётом явно утверждённого изменения приёмки20.10 и подтверждённом live пути, без обходов бюджета. Иначе root фиксирует точный незавершённый gate и продолжает рабочий честный stub. Публикация видео/официальная отправка не входят в этот план.

## Текущий блокер20.10

M2 и M4.3a/b/c/d/e приняты. Последняя offline сборка3410a4a/fKShKXBBTO6GrZDupxTsU:
923authorunit/344independenttargeted/rootlint-types-build-strictNFT/keyscan0 PASS. Canonicalv4/caps2/1.5/4,
три approved bounds .912750001/actualnull. Разрешён Qwen12×2=24 с отдельной
qualification flag; исходные72/48 incomplete. Первый Qwen intent HTTP429/no-cost,
1 POST/0 retries, новый unknown .26160384, allpaidSTOP/winnernull.
Четвёртый grant пока не разрешён. US route3410a4a принят independent offline
review без снижения reserve; устранение429/отдельная квота не доказаны.
[Текущая передача](handoff.md) и [бюджет](budget.md) содержат точные остатки.

## Передача

Checked substeps задачи1 означают доказанный preflight, первый settled query_embedding с protocol STOP и два отдельно принятых chat diagnostics. Кампания закрыта; повторных ключевых тестов нет. Проверенные source/index/runtimeprobe substeps отмечены выше; полный modelcomparison/liveUI/cutover остаются незавершёнными. Порядок paid действий последовательный; независимые RED/source-review задачи можно делегировать параллельно с разными owned files. После каждой приёмки только интегратор обновляет tracker/progress; stage commit — после review в пределах текущего разрешения. Автор этого плана не запускал сеть, auth, env/key reads, paid calls, индекс или live eval и не менял implementation/артефакты.

Итоговые приватные receipts: `/tmp/aituhack-mvp/live-key-check-20261020/campaign-report.md` (SHA256 `9559df5770c6751532a464a696f61af4e2b89a7e1cfd392be0e2b3a65378233e`), 46checksummed artifacts. Это проверка доступа/учёта, не выбор модели и не full P0.

Официальные API references: [проверка текущего ключа](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [embeddings](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request), [embedding models](https://openrouter.ai/docs/api/api-reference/embeddings/list-embeddings-models).
