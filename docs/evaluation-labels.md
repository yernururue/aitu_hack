# Реальная разметка retrieval до реализации поиска

`evals/real-cases.json` — начальный набор **12 положительных RU-запросов** и
**4 отрицательных guard cases**, schemaVersion=1.0, synthetic=false. Разметка
составлена из фактов каталога до реализации retrieval. Ранжированную выдачу,
эмбеддинги и ответы модели не использовали. Это agent-curated development set,
а не независимый слепой human benchmark; review и дальнейшая оценка нужны отдельно.

В каждой записи есть полный `request` по `RecommendRequestSchema`, тестовое `now`
снаружи request, критерий релевантности, **все** relevantIds, полный hardEligibleIds,
sourceIds/URL/дата источника и короткое обоснование каждого релевантного ID.
API не принимает `now` от браузера: здесь это только фиксированные часы теста.

## Привязка к данным

- Каталог: `data/catalog/places.json`, 298 POI, synthetic=false.
- SHA-256 каталога:
  `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`.
- Текущий `import-report.sourceSnapshot`: `2026-10-19T18:41:06.854110+00:00`.
  Это generation timestamp финального normalized snapshot, не дата публикации POI.
- Диапазон collectedAt источников принятого Catalog:
  `2026-10-19T18:24:24Z` — `2026-10-19T18:35:43Z`.
- Разметка зафиксирована `2026-10-19T19:03:42.865207+00:00`
  (20 октября в Asia/Almaty).
- SHA-256 файла labels:
  `73947dd92e4b33641897321e6832ef0dad463dbe33baee4512e8be2efc5cee36`.

Источник — листинги 2ГИС из существующего Apify workflow. Label evidence использует
listing source, без копирования отзывов и авторских профилей. Набор предназначен
для локальной разработки; права публикации исходных отзывов не установлены.

Три пресета совпадают с UI: EXPO `(51.090,71.418)`, Бәйтерек
`(51.1282,71.4304)`, Набережная `(51.1669,71.4179)`. На каждый приходится 4
positive cases. Это фиксированные точки UI, а не местоположение пользователя.

## Правило разметки

Сначала проверяются все hard filters: canonical category, haversine distance
≤radiusM (R=6371000 м), duration≥минимума категории, известная цена при строгом
бюджете, часы и обязательные confirmed facts. При известных часах закрытое место
исключается даже с openNow=false. Неизвестные часы допустимы только с
openNow=false и предупреждением. В overnight проверяется предыдущий день;
остаток до закрытия должен покрывать минимум посещения.

Минимумы из контракта: cafe20, restaurant30, park20, museum40, bowling45,
entertainment30, other20 минут. Дорога отдельно; время посещения — оценка.
Компания сама по себе не доказывает childFriendly или возможность гостевого входа.

Далее применяются только задокументированные semantic criteria:
`exactName`, если прямо названо конкретное место, и `anyTags`, если запрос явно
требует исходную рубрику (кинотеатр, пекарня, коворкинг, художественная выставка,
тренажёрный зал). Все совпадения включены. Если semantic criteria нет, все
прошедшие hard filters места релевантны; рейтинг/бренд/близость не исключают ID.
Неизвестные свойства не считаются отрицательными, но не служат доказательством
положительной релевантности. Эти criteria — oracle labels, не результат intent LLM.

## Положительные запросы

Обычный now — `2026-10-20T10:00:00Z`, вторник 15:00 Asia/Almaty.

| ID | Пресет и задача | Relevant | Ceiling Recall@5 |
|---|---|---:|---:|
| REAL-RU-01 | EXPO: кафе ≤1 км на полчаса | 3 | 1 |
| REAL-RU-02 | EXPO: парк ≤2 км на полчаса; неизвестные часы допустимы | 1 | 1 |
| REAL-RU-03 | EXPO: кинотеатр ≤1 км, друзья, до двух часов | 1 | 1 |
| REAL-RU-04 | EXPO: коворкинг ≤2 км на час; cafe или other | 5 | 1 |
| REAL-RU-05 | Бәйтерек: галерея/художественная выставка ≤1 км | 3 | 1 |
| REAL-RU-06 | Бәйтерек: ресторан ≤1 км, вдвоём на час | 1 | 1 |
| REAL-RU-07 | Бәйтерек: кофе ≤1 км на полчаса | 6 | 5/6 |
| REAL-RU-08 | Бәйтерек: парк «Ғашықтар» ≤2 км на час | 1 | 1 |
| REAL-RU-09 | Набережная: музей с художественной выставкой ≤1 км | 1 | 1 |
| REAL-RU-10 | Набережная: кофейня-пекарня ≤2 км на полчаса | 3 | 1 |
| REAL-RU-11 | Набережная: ночной боулинг ≤5 км, друзья | 1 | 1 |
| REAL-RU-12 | Набережная: тренажёрный зал ≤1 км на час | 6 | 5/6 |

Только RU-08 называет точное POI. Казахские proper names «Бәйтерек», «Ғашықтар»,
«Тәп-Тәтті» в evidence и русское «тренажёрный» сохраняют Unicode; все запросы RU.
Четыре дополнительных KK-запроса проверены и зафиксированы отдельно:
[evaluation-kk.md](evaluation-kk.md), [real-cases-kk.json](../evals/real-cases-kk.json).
Они не входят в исходный12RU denominator; native-speaker/liveKK quality не проверены.

В RU-11 now=`2026-10-20T19:00:00Z`, среда 00:00 местного времени. Strike проходит
по вторничному overnight расписанию: до 01:00 осталось 60 минут, минимум45
помещается. «До двух часов» — верхняя граница, не обещание двух часов игры.

У RU-01 Yourt Nexpo Classic находится примерно в 1002 м, поэтому не входит
в точный радиус1000 м. Это чувствительный к координатам край: при новом снимке
проверить вновь, не считать rounded distance или реальный пешеходный маршрут.
В RU-05 центр рукописей проходит hard filters, но не размечен как художественная
выставка; в RU-09 музей Сейфуллина также не получает неподтверждённую art category.

## Отдельные отрицательные cases

| ID | Требование | Почему relevantIds пуст |
|---|---|---|
| REAL-NEG-01 | Кафе ≤3000 KZT на человека | Все price=null; средний чек не price.max |
| REAL-NEG-02 | Открытый парк у EXPO | Единственный park в2км имеет hours=null |
| REAL-NEG-03 | Ночной боулинг, now=00:30 среды | Strike остаётся30 мин <minimum45; другие closed/вне радиуса |
| REAL-NEG-04 | Кафе обязательно с розеткой | Нет confirmed outlets=true ни у одного POI |

Отказы не входят в положительный denominator. Для NEG-04 ожидается извлечение
requiredFacts=[outlets]; отказ intent upstream оценивается отдельно от retrieval.
На positive cases maxSpendKzt=null и requiredFacts=[]: отсутствие цен/amenities
не маскируется под доказанное прохождение строгих требований.

## Метрика и изменения labels

Recall@5 для positive = `|top5 ∩ relevantIds| / |relevantIds|`, macro-average
по ровно12 positive cases. Для двух широких запросов сохранены все6 релевантных
ID. Поэтому теоретический macro ceiling — **0.9722222222**, а не1.
Это верхняя граница набора, **не измеренный результат поиска**. Success@3,
hard-filter accuracy, отказы и source accuracy считать отдельными метриками.

При обновлении данных hash mismatch должен останавливать применение этих labels.
Исправления после появления поиска допустимы только при фактической ошибке:
записать старый/новый ID, источник и причину. Не удалять неудобные relevant IDs
и не менять запросы под результат ранжирования. Новый набор требует отдельной версии.

## Маленькая локальная проверка

Нужны только установленные зависимости проекта. Скрипт ниже проверяет JSON,
Catalog/RecommendRequestSchema, hash, ISO dates, все source refs и cardinality.
Сеть, ключи и модель не нужны. По этой же разметке отдельно выполнено независимое
перечисление hard/semantic sets через Haversine и Intl/IANA расписание; все16
sets совпали, включая прошлый день и минимум45 минут для bowling.

```sh
node --import tsx --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {CatalogSchema} from './src/lib/contracts/poi.ts';
import {RecommendRequestSchema} from './src/lib/contracts/request.ts';
const text=readFileSync('data/catalog/places.json','utf8');
const catalog=CatalogSchema.parse(JSON.parse(text));
const labels=JSON.parse(readFileSync('evals/real-cases.json','utf8'));
assert.equal(catalog.synthetic,false); assert.equal(labels.synthetic,false);
assert.equal(createHash('sha256').update(text).digest('hex'),labels.metadata.catalogSha256);
const byId=new Map(catalog.places.map(p=>[p.id,p]));
for(const c of labels.cases){
  RecommendRequestSchema.parse(c.request);
  z.iso.datetime({offset:true}).parse(c.now);
  assert.equal(new Set(c.expected.relevantIds).size,c.expected.relevantCount);
  assert.equal(c.expected.evidence.length,c.expected.relevantCount);
  for(const e of c.expected.evidence){
    const p=byId.get(e.poiId); assert(p);
    assert(c.expected.relevantIds.includes(e.poiId));
    const sources=e.sourceIds.map(id=>p.sources.find(s=>s.id===id));
    assert(sources.every(Boolean));
    assert.deepEqual(sources.map(s=>s.url),e.sourceUrls);
    assert.equal(sources[0].collectedAt,e.sourceCollectedAt);
  }
}
assert.equal(labels.cases.filter(c=>c.countInPositiveMetrics).length,12);
assert.equal(labels.cases.filter(c=>!c.countInPositiveMetrics).length,4);
console.info('PASS: 16 requests; 12 positive / 4 negative; hash and source refs');
JS
```
