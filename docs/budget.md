# Учёт расходов OpenRouter

Платный режим по умолчанию выключен (`OPENROUTER_PAID_ENABLED=false`). Ключ
проверяется только на сервере; его наличие не разрешает вызовы. На момент M2.3
проверка ключа интегратором вернула HTTP 401. Эта реализация проверена только
локальными provider stubs; платных или авторизованных сетевых вызовов в ней не было.

## Границы бюджета

- Подготовка, индексация, разработка, тесты и повторы: **не более $2**.
- Live-eval: **не более $0.50 внутри этих $2**, отдельно включается
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
redirects и максимум 25 секунд. Встроенных повторов нет. Будущий M3.2 допускает
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

Резерв использует зафиксированные публичные ставки моделей от 19.10.2026, включая
максимальные context tiers/cache-write rates. Chat резервирует весь model context
и весь provider max output; отправляет меньший явный output limit. Embeddings —
8192 токена на каждый input при $0.02/M: 30 документов резервируют $0.00491520.
Тело ограничено текстом и размером; при неизвестной модели/цене вызов запрещён.
Большой резерв Haiku может не пройти $0.50 eval subcap — ограничение не ослаблять.
Для более точного резерва нужен отдельно проверенный полный token bound.

`provider.max_price` — потолок **ставки**, не суммы запроса: prompt/completion
в USD за миллион токенов; request/image/audio здесь равны 0. `allow_fallbacks=false`,
`require_parameters=true`, динамические routers и новые ценовые измерения запрещены.
Источник: [Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection#max-price).
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
