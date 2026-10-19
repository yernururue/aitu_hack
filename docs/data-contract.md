# Контракт данных и API v1

Этот документ — интерфейс сборщика, поиска и UI. Имена полей ниже обязательны;
смена контракта требует синхронного обновления fixture, валидатора и потребителей.
TypeScript/Zod схемы реализованы в `src/lib/contracts/`; изменения контракта
согласует интегратор вместе с примерами и тестами.

## Каталог

Файл: объект `{schemaVersion: "1.0", synthetic: boolean, places: Poi[]}`.
Реальный импорт имеет `synthetic: false`; тестовый — `true`.

| Поле Poi | Тип / правило |
|---|---|
| `id` | Непустой стабильный ID филиала: `2gis:<id>` или `<source>:<id>` |
| `name` | Непустая строка |
| `location` | `{lat: number, lon: number}`, конечные числа, диапазоны ±90/±180 |
| `category` | `cafe`, `restaurant`, `park`, `museum`, `bowling`, `entertainment`, `other` |
| `description` | `{text: string, sourceIds: string[]}`; текст из источников |
| `tags` | Массив нормализованных строк |
| `address` | Строка или null |
| `rating` | `{value: 0..5, count: integer >= 0, sourceIds: string[]}` или null |
| `price` | `{min: number >= 0, max: number >= min, currency: "KZT", basis: "per_person_visit", sourceIds: string[]}` или null |
| `facts` | Массив `{key, value: boolean, confidence, sourceIds}` |
| `hours` | Структура ниже либо null |
| `links` | `{twoGis: string|null, website: string|null, social: {label,url,sourceIds}[]}` |
| `reviews` | Массив `{id, text, publishedAt: ISO|null, helpfulCount: integer|null, sourceIds}` |
| `sources` | Массив `{id, kind, url, collectedAt: ISO, publishedAt: ISO|null}` |

`facts.key`: `quiet`, `outlets`, `wifi`, `childFriendly`, `indoor`.
`confidence`: `confirmed` или `reported`. Отсутствие записи = неизвестно;
`false` означает подтверждённое отсутствие, не неизвестность.
`sources.kind`: `listing`, `official`, `social`, `review`, `synthetic`.
URL источников — http/https, отображаемые внешние ссылки — https.
Все sourceIds разрешаются в sources той же POI. Sources не могут быть пустыми.
Рейтинг не пересчитывать по двум выбранным отзывам; брать общий из источника.
Цена — оценка одного посещения на одного человека. Час дорожки/стоимость стола
не делится на выдуманный размер компании: если цена неприводима к этой единице,
price=null, исходный тариф остаётся в raw-снимке. UI подписывает «на человека».

### Часы

`hours = {timezone: "Asia/Almaty", weekly: Interval[], sourceIds: string[]}`.
`Interval = {weekday: 0..6, opens: "HH:mm", closes: "HH:mm", overnight: boolean}`;
0 = воскресенье. День без интервала закрыт по известному расписанию.
`overnight: true` переносит closes на следующий день. Одинаковые часы при
overnight=true означают 24 часа. `hours: null` — неизвестно.
Праздничные исключения P0 не моделирует: в UI всегда «по расписанию».

### Импорт

- Сборщик отдаёт первый срез 20–30 мест как можно раньше, затем полный снимок.
- Вместе со срезом нужны код автоматизированного сбора, зависимости и команда
  повторного запуска либо экспорт воспроизводимого агентного workflow с журналом.
  Один вручную заполненный JSON не закрывает требование хакатона об автоматизации.
- Цель: 150–300 полезных мест; минимальный demo gate — 30 проверенных мест
  в трёх зонах и трёх категориях. Число не заменяет качество.
- Сохранять первичный URL и время сбора. Выдуманные описания не маркировать как источник.
- Отдельные филиалы не сливать по названию. Основной dedup — source ID.
- При отсутствии source ID подозрение на дубль: нормализованное имя + близкие
  координаты; отправить на проверку, не объединять автоматически.
- Координаты за пределами Астаны отправлять в отчёт импорта, не подменять центром.
- Вход с неверным типом, ссылкой или координатами отклоняется с причиной.
- Для каждого факта из соцсетей сохранять дату и URL; устаревшее мероприятие
  не становится действующим событием. Мероприятия не входят в P0.
- Отчёт: fetched, accepted, rejected, suspectedDuplicates, missingFields,
  по источникам/категориям/зонам. Сырые файлы не коммитить.

## Запрос POST /api/recommend

```ts
type RecommendRequest = {
  query: string; // 0..1000 символов; пустой допустим при выбранной категории
  locale: "ru" | "kk";
  location: {lat: number; lon: number; source: "device" | "preset"};
  filters: {
    categories: Poi["category"][];
    radiusM: 1000 | 2000 | 5000;
    durationMinutes: 30 | 60 | 120; // верхняя граница посещения, дорога отдельно
    company: "solo" | "couple" | "friends" | "family";
    maxSpendKzt: number | null; // на одного человека за посещение
    openNow: boolean;
  };
  explicitFilterKeys: string[]; // только имена полей Filters, изменённых пользователем
  profileId: "student" | "tourist" | "family" | null;
  savedIds: string[]; // максимум 100, ID каталога
  dismissedIds: string[]; // максимум 100, ID каталога
};
```

Текущее время задаёт сервер. В тестах `now` передаётся во внутреннюю функцию,
но production endpoint не принимает подмену времени от браузера.
Запросы с геолокацией не помещать в URL. Максимум request body — 16 KB.

Извлечение: `parseIntent(query, filters): Promise<Intent>`.
`Intent = {categories, radiusM, durationMinutes, company, maxSpendKzt, openNow,
requiredFacts: FactKey[], preferredTags: string[], conflict: string|null}`.
Поля из explicitFilterKeys — явные UI-ограничения. Остальные значения filters
являются defaults и могут уточняться текстом. Противоречие текста именно явному
ограничению даёт clarification, не скрытое изменение. Это предотвращает конфликт
между фразой «в радиусе километра» и исходным UI-default 2 км.
Профиль влияет только на soft-score. `quiet` по отзывам — предпочтение;
обязательные розетки/indoor/childFriendly требуют confirmed true.
Для строгого бюджета требуется известная price.max <= maxSpendKzt; неизвестная цена не проходит. Для openNow неизвестные
часы не проходят. Если часы известны и сейчас закрыто — исключать место независимо
от openNow; при openNow=false неизвестные часы допустимы с предупреждением.
Текстовый бюджет «на всю компанию» без однозначной суммы на человека требует
уточнения. Длительность посещения — оценка, не подтверждённый факт.

Оценки посещения вычисляет код по категориям (min/max минут): cafe 20/40,
restaurant 30/60, park 20/60, museum 40/90, bowling 45/90,
entertainment 30/60, other 20/45. max ограничивается durationMinutes и известным
остатком до закрытия; если остаток или бюджет меньше min, место исключается.
Проверка предыдущего дня обязательна для overnight. Часовой бюджет не означает,
что дорога туда/обратно включена: это явно поясняется в UI и ответе.

## Ответ

```ts
type RecommendResponse = {
  status: "ok" | "no_results" | "needs_clarification" | "degraded";
  message: string;
  recommendations: Recommendation[]; // 0..3
  usedContext: {locationLabel: string; filters: Intent; profileId: string|null;
    isDemoProfile: boolean; dataSnapshot: string};
  warnings: string[];
};
type Recommendation = {
  poi: Poi; // фактические поля загружает сервер
  distanceM: number;
  distanceKind: "straight_line";
  why: string;
  activity: string; // идея AI, отдельная подпись в UI
  visitMinutes: {min: number; max: number; isEstimate: true};
  evidenceIds: string[];
  navigation: {twoGis: string|null; googleMaps: string};
};
```

LLM получает только 8 кандидатов; возвращает `{items: [{poiId, why, activity,
evidenceIds}]}`. visitMinutes передаётся модели как ограничение занятия и
добавляется сервером. Запрещены поля для новых рейтингов,
URL, координат и часов. Сервер проверяет схему, ID в candidate set, evidence IDs,
границы времени и максимум 3 результата; затем дополняет фактами из каталога.
Оценка посещения: 5 <= min <= max <= durationMinutes. Это не обещание, что
дорога и посещение вместе уложатся в срок; точный путь показывает навигатор.
Проверка evidence IDs не доказывает правильность текста — это отдельный eval.

Сбои разделены: intent при непустом query → needs_clarification без рекомендаций,
с просьбой повторить или выбрать явные фильтры; пустой query → локальный intent
из UI без LLM. Embeddings/index → помеченный lexical fallback с уже извлечёнными
ограничениями. Explanation → детерминированные карточки уже отфильтрованных POI
со status=degraded. Нельзя терять ограничения при переходе в fallback.

200: нормальный ответ, включая пустой/уточнение/degraded.
400: неверная форма запроса, понятное сообщение.
429: лимит запросов; 503: нет безопасного результата из-за недоступного каталога.
Ошибки upstream/ключи в пользовательский ответ не выводить.

## Индекс

`Index = {schemaVersion: "1.0", model: string, dimensions: number,
datasetHash: string, documentVersion: "poi-v1", vectors: {poiId, values: number[]}[]}`.
Все значения конечны, размерности совпадают, IDs существуют и уникальны.
`datasetHash` вычисляется как SHA-256 UTF-8 `JSON.stringify(CatalogSchema.parse(catalog))`
(канонический порядок ключей runtime-схемы, без pretty-print). File SHA-256 в labels
проверяется отдельно и не подменяет canonical datasetHash.
Не смешивать модели/размерности. Несовпадение hash блокирует векторный поиск;
допустим явно помеченный lexical fallback. Генерировать вектора по имени, описанию,
категории, тегам и подтверждённым фактам, не по произвольным URL или отзывам.

## Внутренний retrieval context

`RankingContext` дополнительно получает валидный `Intent` и серверный `now: Date`,
чтобы `visitMinutes` ограничивался выбранной длительностью и остатком до закрытия.
`profileId` допускает null. Необязательный `semanticScores: Readonly<Record<string,number>>`
передаёт только внутренние конечные scores0–1; клиентский POST такого поля не принимает.
`retrieve` допускает четвёртый server-only dependencies аргумент для catalog/provider
инъекции в тестах. Ответ HTTP и правила извлечения/фактов остаются по v1 выше.

`retrieveWithMetadata` — внутренний дополнительный интерфейс
`{candidates: RankedPoi[], mode: "semantic"|"lexical", warnings: string[],
dataSnapshot: string}`; `dataSnapshot` — canonical datasetHash.
`retrieve` сохраняет прежний результат `RankedPoi[]`. Mode/warnings отражают реальное
использование индекса; downstream не объявляет lexical поиск векторным.


## Кеш векторов оценочных запросов

Внутренний `QueryVectorCacheSchema` / `QueryVectorCache`:
`{schemaVersion:"1.0", model:string, dimensions:integer1..1536,
datasetHash:canonicalCatalogSHA256, queries:Record<queryHash,number[]>}`.
`queryHash` — SHA-256 UTF-8 исходного текста запроса без подмены gold-критериями.
Вектора конечны, ненулевые и имеют заданную размерность; модель, размерность и
хеш каталога должны совпадать с проверенным индексом. Кеш не хранит текст запросов.

`evaluateCases` допускает server-only `index/queryCache/embed/checkpointQueries`
инъекции. CLI по умолчанию только читает кеш и не вызывает сеть; отсутствие либо
несовместимость данных даёт помеченный lexical fallback. Явный `--prepare-queries`
может готовить недостающие query vectors через guarded `live_eval` только после
проверки полного индекса и конфигурации бюджета. Успешный батч сохраняется атомарно
с fsync до следующего вызова; финальный POI-index публикуется только после полной
валидации. См. [indexing.md](indexing.md). HTTP v1 не принимает эти параметры.


## Серверный structured adapter

`ChatJson({stage, messages, jsonSchema:{name,schema}, deadlineAt, signal?, purpose?})`
возвращает parsed unknown только после учёта фактической стоимости. `stage` —
intent/explanation, output limit — 400/1000; strict schema, все поля object обязательны,
additionalProperties=false, удалённые refs и unsupported dynamic/recursive refs запрещены.
Локальная Zod/grounding проверка core остаётся обязательной.

`deadlineAt` — исходный серверный epoch-ms, общий для intent/embedding/explanation,
не более25s от входа; попытка не более15s. Браузер не задаёт эти поля. Разрешён максимум
один отдельно учтённый повтор при известной durable стоимости и recoverable protocol/HTTP
ошибке. Unknown cost, abort, budget/IO failure, auth/refusal не повторяются.
`ChatJsonError` содержит только sanitized code/stage/costKnown/dispatched.

Необязательный server-only `createChatJson({onAttempt})` получает metadata после
учёта стоимости: model/responseModel/provider, latency, usage/cost, outcome/attempt/status.
Нет sink по умолчанию и production logging; callback не влияет на оплату/повторы/ответ.
Eval собирает события синхронно и сам сохраняет отчёт. Protocol ok ещё не означает
grounding PASS. Source: `src/lib/ai/openrouter.ts`; HTTP v1 не расширяется.


## Raw envelope и проверенные элементы

Сетевой ответ модели остаётся `{items:[{poiId,why,activity,evidenceIds}]}`.
Внутренний `ExplanationSchema` валидирует envelope, а `validateExplanation`
возвращает проверенный item array: derived `GeneratedItems = ExplanationItem[]`.
`explain` также возвращает этот массив. Это согласовано с core и eval consumers;
HTTP response не меняется. Фактические поля добавляет recommend из каталога.

Утверждения о amenities в сгенерированных why/activity отклоняются консервативно,
включая противоположные и атрибутированные через один найденный substring.
Подтверждённые факты и доступные тексты отзывов показываются отдельно из POI,
с источниками и пометкой мнения. Обязательное quiet нельзя молча ослаблять до
предпочтения: при неуверенности требуется уточнение без карточек.
