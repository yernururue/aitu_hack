# Текущий checkpoint — 21 октября 2026

[Новый интерфейс](https://facing-workshops-quote-finding.trycloudflare.com) работает в явно обозначенном режиме **без ИИ / paid=false**. Категории, строгие фильтры, реальные места, источники и маршруты доступны. Редизайн и минимальный контент приняты отдельно от live-приёмки:1055unit,70offlinee2e, lint/types/build/strictNFT/harness прошли; source4aff3b4/build6OQ. Актуальные материалы и проверки — в [README](../README.md).

Единственная новая реальная UI-попытка вернула HTTP200/needs_clarification/0мест и **неизвестную стоимость** demo intent. Canonicalv6/40entries/uncertaintrue/unknown1/inFlight0: reserve$0.028096/actualnull, новые paidSTOP. Caps$2подготовки/$1.50eval внутри/$4демо неизменны; новый grant не дан. Нет повторов, предположения о cost0 или успешного нового AI-видео. Две записи разделены: новый функциональный обзор безИИ и отдельная неудавшаяся live-попытка. Исторические успешные smokes не являются новым видео.

Заявка уже отправлена пользователем. Повторная отправка не выполнялась. Физический телефон/полный модельный eval/голос/постоянный hosting остаются незавершёнными. Старые runtime/build/media/collector сохранены.

<details>
<summary>Исторические checkpoint и материалы до редизайна — не текущий статус</summary>

# Учёт расходов OpenRouter

## Текущий emergency checkpoint

Снимок после двух private QA, до публичного пользовательского трафика: canonical v6: 39 записей — 34 known и 5 upper-bound allocations с actual=null. Известный actual prep $0.002178331, включая eval $0.00168309; бюджетные оценки $1.435957681 считаются отдельно от actual. Budget spent prep $1.438136012/eval $1.437640771; доступно prep $0.561863988/eval $0.062359229/demo $4. Резервов и in-flight нет, uncertain=false, права0600, caps $2/$1.50/$4 неизменны. Следующий unknown/overshoot/ошибка durable ledger снова останавливает платные вызовы.

После прямого указания пользователя «подключи настоящий ИИ, пару тестов…» root записал emergency-интерпретацию: exact fifth targetc54e0818-1757-4752-a3cc-42299566784d, $0.26160384 бюджетногоcharge/actualnull и только2smokes. Пользователь не повторял сумму буквально; это прямо указано в immutable authorizationa632150d-0dcb-45dc-9e8a-0e36eee2ce31/refuser-direct-emergency-live-smoke-20261020T175612Z. Reviewedv6source/operator примененыодинраз и отдельноаудированы29checks. Все5grants/history сохранены; не replay operators, не settle0 и не reset ledger.

Реальные2private smoke:4settled calls prep(intent/query_embedding/explanation/intent), actual$0.0002702. Prior35SHA4a5061…64ef восстановленточно;39ledgerSHAa7a26c1d…645f9. Demo0,evalknownunchanged. Publicpurpose=demo; cutoverGET/assetprobe не делал новыхpaidQA. Ключтолькоserver, однаcanonicalpersistentledger/lock; новый неизвестныйcost/overshoot/IOfault сноваSTOP. Фактические расходы и approvedbudgetbasis не смешивать.

Доказательства: `/tmp/aituhack-mvp/fifth-upper-bound-emergency-20261020/actual-review.md`, `/tmp/aituhack-mvp/emergency-live-release-20261020/both-smokes-audit.json` и независимыйsmoke/humanreview. Это не разрешениеfull12eval или будущихunknown. Полная модельнаяприёмка не завершена.

## Исторические checkpoint и интерфейсы — прежние числа не текущий остаток


Canonical ledger v5/35 записей/0600: 30 known, четыре approved upper bounds с actual=null и новый пятый unknown `c54e0818-1757-4752-a3cc-42299566784d`. uncertain=true, inFlight=0. Известный округлённый prep $0.001908131, включая eval $0.00168309; четыре бюджетные оценки $1.174353841 учтены по одному разу, они не являются восстановленной фактической стоимостью. Новый резерв $0.26160384; exposure prep $1.437865812/eval $1.437640771; доступно prep $0.562134188/eval $0.062359229/demo $4. Потолки $2/$1.50/$4 сохранены. Пятого согласия нет, все платные вызовы STOP. API принял ключ; отдельного лимита ключа не задано, кредит есть. Exact generation GET для `gen-1792517117-9rLmsCooRUs1A7VCZ6VY` вернул404; это не доказательство нулевой стоимости.


## История и правила учёта

## Новое отдельное согласие20.10,22:09

Разрешён четвёртый exact Qwen429 upper bound $0.26160384 (actual=null),
один новый QwenUS24 прогон; caps2/1.5/4 неизменны. Auth9cc3b06a-502e-4e52-810b-4f38f56f6854.
V5source/оператор/actualaudit ещё готовятся, canonical покаv4unknown/paidSTOP.
Предыдущий checkpoint ниже — состояние до этого нового согласия.

Платный режим по умолчанию выключен (`OPENROUTER_PAID_ENABLED=false`). Ключ
проверяется только на сервере; его наличие не разрешает вызовы. На момент M2.3
проверка ключа интегратором вернула HTTP 401. Эта реализация проверена только
локальными provider stubs; это историческое состояние M2.3.

M2.6: обновлённый ключ auth200, реальные3diagnostic POST учтены в едином ledger:
$0.00024488 внутри prep/live_eval, uncertain=false/inFlight0/reserved0, demo$4.
Два chat schema/evidence PASS; embedding HTTP200 остановлен на model alias до1536
validation. Это не full RAG acceptance. Ledger уже создан0600: **не повторять
инициализацию ниже**, не менять путь. [План и receipts](live-p0-plan.md).

## Текущее состояние 20.10, 21:55 Asia/Almaty

Единственный canonical ledger: основной `data/private/openrouter-budget.json`,
версия 4, 34 записи, 0600, uncertain=true/inFlight=0. Известные округлённые
фактические расходы: prep $0.001908131, включая eval $0.00168309, demo $0.
Три явно разрешённых верхних оценки: $0.264+$0.264+$0.384750001=$0.912750001,
учтены по одному разу; их actual остаётся null. Это бюджетные выделения,
а не восстановленная фактическая стоимость.

Новый unknown Qwen: `bf021306-da2b-43ca-a54e-6a7cfe23ac48`, резерв $0.26160384,
actual=null. Budget spent prep $0.914658132/eval $0.914433091, вместе с новым
резервом exposure $1.176261972/$1.176036931. Доступно после резерва prep
$0.823738028/eval $0.323963069/demo $4. Потолки $2/$1.50/$4 сохранены.
Четвёртого отдельного разрешения пока нет; guessed actual, reset/copy ledger,
повтор старых one-use operators или автоматическое снятие STOP запрещены.

В Upstream Requests найден exact `gen-1792514522-MOmoVI0e8ysvVQp9YKDB`,
20.10 21:42 Asia/Almaty, Alibaba Cloud Int., HTTP429, 1 attempt. Стоимости и
точного endpoint tag в UI нет; официальный generation GET вернул 404.
Отсутствие записи не доказывает нулевую стоимость. Региональный US endpoint
присутствует в свежих public metadata с прежними ставками, но его квота и
устранение ошибки не проверены. Новых модельных запросов после STOP не было.

## Границы бюджета

- Подготовка, индексация, разработка, тесты и повторы: **не более $2**.
- Live-eval: **не более $1.50 внутри этих $2**, отдельно включается
  `LIVE_EVAL_ENABLED=true`.
- Демо: **отдельные $4**. Недостаток подготовки не переносит расход в demo.
- Env может только уменьшать эти потолки. Пониженный потолок сохраняется в ledger
  и не повышается при перезапуске с другим env.
- Перед каждым вызовом считаются фактические списания и незавершённые резервы.
  Одновременно разрешены максимум два запроса во всех процессах одного хоста.
  Суммы округляются вверх до целого nano-USD; оценки никогда не заменяют фактическую цену.

`purpose` задаёт серверный сценарий, а не тело пользовательского запроса.
`index_embedding` разрешён только для подготовки. Audio пока запрещён; его будущий
адаптер обязан использовать тот же ledger после проверки цены и ограничений.

## Хранение и инициализация

Ledger JSON и межпроцессный directory lock используют одну **локальную постоянную
файловую систему**. Транзакция: lock → чтение/проверка → проверка лимитов и изменение →
временный файл 0600 → fsync → atomic rename → fsync директории → unlock.
Никакого обхода через память при ошибке файла нет. Повреждённый или отсутствующий
ledger, отказ записи и зависший lock останавливают платную работу.

Каталог `data/private/` уже исключён из git и production tracing. Один раз до
платного запуска явно создать ledger (Node 24, из корня проекта):

```sh
node --import tsx --input-type=module -e 'import {initializeLedger} from "./src/lib/ai/budget.ts"; import {resolve} from "node:path"; await initializeLedger(resolve("data/private/openrouter-budget.json"));'
```

Команда не вызывает OpenRouter и откажется перезаписывать существующий файл.
Для выбранного ledger задать абсолютный `OPENROUTER_LEDGER_PATH`, затем
`OPENROUTER_STORAGE=single_host_persistent`. Пустой `OPENROUTER_LEDGER_PATH` использует
абсолютный путь по умолчанию. Не удалять ledger и не менять
путь ради восстановления лимита. Отсутствующий файл никогда не инициализируется
автоматически при запросе.

**Платный режим запрещён на Vercel/Lambda/Netlify, ephemeral и независимых репликах.**
Конфигурация известных serverless окружений отклоняется. Оператор также обязан
подтвердить единственный хост и постоянный диск для иных окружений: локальный JSON
не обеспечивает общий бюджет нескольких машин. Для такого размещения нужен
общий транзакционный durable backend; offline/lexical/stub режимы доступны сейчас.

Lock не удаляется автоматически по TTL: владелец может ещё работать. Ошибка записи,
rename/fsync или чтения при dispatch/settlement сохраняет blocking lock даже после
восстановления I/O; следующему guard/process запрещены новые резервы. Обычный
проверенный отказ preflight с успешным durable commit освобождает lock штатно.
После crash или ошибки commit оператор должен подтвердить отсутствие процессов, сохранить
ledger и lock для аудита и устранить lock вручную. Crash после завершения транзакции
обнаруживается по PID/30-секундному сроку незавершённого резерва. Он становится
`unknown`, сохраняет сумму и блокирует дальнейшие расходы. Повторное использование
PID не освобождает резерв; срок всё равно приводит к блокировке.

## Интерфейсы для следующих этапов

```ts
const guard = new BudgetGuard({ path: absoluteLedgerPath, caps: serverConfig.caps });
const quote = quoteRequest({
  operation: "index_embedding",
  model: "openai/text-embedding-3-small",
  inputCount: documents.length, // 1..64, только изменённые hash
});
const transport = createLiveTransport(); // откажется, пока paidEnabled=false
await transport.execute({
  purpose: "prep",
  quote,
  body: { input: documents, dimensions: 1536 },
});
```

`quoteRequest` выдаёт неизменяемый объект, созданный проверенным pricing module.
Подменённая оценка, неподдерживаемые model/operation, billed extras, мультимедиа,
tools/plugins, произвольные provider settings и несоответствие inputCount отвергаются
до отправки. Транспорт формирует fixed endpoint/model/provider caps и текстовое тело.
Для M3 можно передать quote с `operation: "intent" | "explanation"` и явным
`maxCompletionTokens`; тело содержит `messages` и при необходимости `response_format`.
Это один оплачиваемый attempt. JSON Schema/grounding и политика повторов — M3.2.

Низкоуровневый `BudgetGuard` также предоставляет:

```ts
reserve({ purpose, operation, estimatedUsd }) // opaque {id}; сохранить до отправки
markDispatched(reservation)                 // записать до fetch
settle(reservation, actualUsd)              // число >=0; null → unknown + STOP
releaseBeforeDispatch(reservation)          // только доказанный отказ до отправки
snapshot()                                 // caps/spent/reserved/available/uncertain
```

Live transport использует native fetch, фиксированный HTTPS origin, запрещённые
redirects и максимум 25 секунд. В transport встроенных повторов нет. M3.2 adapter допускает
максимум один повтор внутри общего deadline: каждая попытка отдельно резервируется
и оплачивается; попытку с неизвестной ценой повторять нельзя.

Тесты создают реальные временные ledger и внедряют `send` в `GuardedTransport`.
Ключ и сеть им не нужны. Реальные `.env` не печатать и не читать в отчёт.

## Цена и неопределённость

Текущие API возвращают actual charge в `usage.cost` как для chat, так и для
embeddings. Поле embeddings может отсутствовать по OpenAPI-схеме, поэтому во время
выполнения обязательно проверяется конечное неотрицательное число. Явный `0` допустим.
Отсутствующее, null, строковое или неверное число создаёт `unknown`. `is_byok:true`
также блокирует вызовы, поскольку внешние расходы не покрыты этим ledger.

Источник: [Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting),
[официальная OpenAPI-схема embeddings](https://openrouter.ai/openapi.json).
`usage.include` и `stream_options.include_usage` устарели и не нужны.
Стоимость сверяется **до** разбора результата по прикладной схеме: неверный JSON
ответа модели, HTTP error и schema rejection тоже могут стоить денег.

Timeout, abort, network error, неверный JSON HTTP-тела или HTTP error без цены после
отправки — это `unknown`, а не нулевая цена. Семантика бесплатного отказа для 401/429
не была установлена; транспорт не освобождает такой резерв. Actual выше резерва
записывается и тоже блокирует следующие расходы даже при остатке общего бюджета.

Резерв использует проверенные20.10.2026 model+endpoint ставки. Luna/Qwen учитывают
наибольшие допустимые cache-write tiers, включая региональные варианты; quote соответственно
$0.384750001/$0.26160384. Chat резервирует весь model context и весь provider max output,
хотя отправляет400/1000. Скрытый framing/JSON Schema/Unicode/reasoning входят в эти полные
границы; приблизительная оценка токенов по длине не используется. Embeddings —8192 токена
на каждый input при $0.02/M. Тело ограничено текстом и размером; неизвестная цена запрещена.

Для Haiku принят отдельно проверенный маршрут `only:["azure/global"]`: hard rate caps
prompt$0.10/M, completion$0.50/M, no fallback. Полный1Mcontext по максимальной
документированной2xcache-write ставке$0.20/M плюс128koutput дают reserve$0.264.
Это опирается на официальный контракт `max_price` как потолка оплачиваемой ставки;
запрос по недоступной цене должен быть отклонён. Conditional tiers выше потолка
не разрешены. Pure `verifyQuoteMetadata` проверяет точный endpoint, параметры,
context/output, все формы цен/cache multiplier и неожиданные оплачиваемые измерения.
Изменение контракта/метаданных запрещает следующий вызов; unknown/overshoot остаются STOP.
Доказательство и код3d92116 приняты независимым review,41focusedPASS/154author tests.
Нативная schema-совместимость и полный model comparison — отдельные gates перед dispatch.

Перед каждой последовательной попыткой резервируется её полный bound, после ответа
settle учитывает известную actual цену. Сумма гипотетических максимумов всего расписания
не обещает завершение: при недостатке остатка следующий batch запрещён, сравнение остаётся
неполным. Неполный набор не даёт winner без явного изменения приёмки пользователем.
Нельзя самостоятельно повышать текущие caps $2/$1.50/$4 или тратить demo на подготовку.

`provider.max_price` — потолок **ставки**, не суммы запроса: prompt/completion
в USD за миллион токенов; request/image/audio здесь равны 0. `allow_fallbacks=false`,
`require_parameters=true`, динамические routers и новые ценовые измерения запрещены.
Источник: [Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection#max-price),
[официальное объяснение rate caps](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/).
[Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
тоже оплачиваются; [cache writes](https://openrouter.ai/docs/guides/best-practices/prompt-caching)
могут быть дороже prompt. Не полагаться на экономию кеша или идеальную точность max_tokens.

## Явная сверка после остановки

В ledger нет запросов, координат, аудио, ключа, сырых HTTP-тел и содержимого сообщений.
Хранятся UUID попыток, назначение/операция, суммы, PID, срок и состояние. Неизвестная
цена сохраняет резерв. Сначала оператор подтверждает все реальные списания во внешнем
биллинг-аудите. Для chat возможен авторизованный
[GET generation](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation)
с `data.total_cost`; embeddings ID не предполагается совместимым с этим endpoint.

После проверки оператор передаёт `settle({id}, verifiedActualUsd)` для неизвестной
попытки. Это записывает позднюю цену, **сохраняя блокировку**. Затем только вручную
вызвать `confirmReconciliation(auditUuidV4)` со ссылкой UUID на внешний аудит.
Метод откажет при любом незавершённом резерве, неизвестной цене или превышении
любого потолка; успешная сверка сохраняет UUID и время. Он не изменяет прошлые
списания/лимиты и не должен вызываться из пользовательского endpoint или retry loop.
Обнаруженный перерасход, неверная оценка или конфликт settlement требуют проверки
pricing/transport до подтверждения сверки; деньги не «возвращаются» обнулением ledger.

## Проверки

```sh
pnpm exec vitest run tests/unit/budget.test.ts
pnpm test
pnpm typecheck
pnpm lint
```

Проверяются границы/округление, prep/eval/demo, независимые instances и процессы,
crash/restart, неизвестная цена и превышение резерва, поздняя цена и аудируемая
сверка, отдельно оплаченные попытки, неправильные суммы/цены/назначения, config
без клиентских env, отсутствие сети в stubs и отсутствие текста запроса в ledger.


## Отмена и deadline текстового пути

M3.2 добавляет strict structured adapter: 15s на попытку, исходный общий25s deadline,
не более одного отдельно зарезервированного/учтённого повтора при известной стоимости.
Отмена до отправки освобождает резерв либо записывает доказанный нулевой расход.
После отправки timeout/abort без usage.cost фиксирует unknown и останавливает новые
платные обращения; это не считается бесплатным запросом. Ошибки схемы/JSON также
могут стоить денег и учитываются до parsing.

Безопасный fsync учёта нельзя принудительно прервать. HTTP core ограничивает срок
ответа отдельно, а accounting cleanup может завершиться позже; после отмены
отложенная запись диска не должна приводить к поздней отправке провайдеру. Эти случаи
проверены injected tests. M2.6 проверил реальные known-cost settlements трёх
диагностических вызовов; реальные abort/crash/reconciliation и полный pipeline
этим не проверены.

## Дополнительное явное разрешение20.10, 19:19

Для второго exacttarget553ee649-3235-44e0-8a07-69ac0c8de613 пользователь
разрешил budget upper-bound$0.264 с actual=null и eval$1 внутриprep$2;
demo$4сохраняется. Первый exception .264 остаётся отдельно. Итого после
reviewedv3/application: .528upperbounds+knownactual, не доказанный billedcost.
Это разрешение уже применено и независимо проверено; будущий unknown сноваSTOP.
Auth87921423-9345-419a-bd47-c90f0e8b0c38; никакого reset/copy/settle-guessedactual.

## Третье явное разрешение20.10,19:49

Для target3943a5d8-151c-42e4-980c-a50a869dfb8e пользователь отдельно разрешил
upper bound .384750001/actualnull, cap live-eval1→1.50 внутриprep2/demo4.
Auth00d1c10d-26b9-4daf-8107-964a5375bb67. Source/operator и canonicalv3→v4
независимо проверены, все прошлые записи/два предыдущих grant сохранены;
три bounds .912750001 учтены однократно. Изменён только nonsecret env cap1→1.5,
остальные credential bytes равны в памяти. Новый Qwen429 unknown отдельный,
это разрешение его не покрывает. Конструктор/env не повышают persisted limits.


</details>
