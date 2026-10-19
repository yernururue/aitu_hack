# Контракт данных и API v1

Этот документ — интерфейс сборщика, поиска и UI. Имена полей ниже обязательны;
смена контракта требует синхронного обновления fixture, валидатора и потребителей.
TypeScript/Zod схемы будут реализованы на этапе 1. Сейчас runtime-схем нет.

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
Не смешивать модели/размерности. Несовпадение hash блокирует векторный поиск;
допустим явно помеченный lexical fallback. Генерировать вектора по описанию,
категории, тегам и подтверждённым фактам, не по произвольным URL.
