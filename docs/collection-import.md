# Импорт реального каталога M1.3

`data/catalog/places.json` — отдельный валидированный Catalog v1 (`synthetic=false`),
который читает `loadCatalog()`. Это локальная демонстрационная поставка. Источник —
листинги и выбранные отзывы 2ГИС, собранные существующим Apify workflow
`scripts/collect_astana.py` (Actor `kyungminlee/twogis-places-reviews-scraper`, build
0.1.13). Сборщик, raw и normalized снимки адаптер не изменяет.

Снимок источника: `2026-10-19T18:41:06.854110+00:00`. Его 5 raw SHA-256,
run/dataset IDs и upstream counters перенесены в `data/catalog/import-report.json`.
Код адаптера — `src/lib/data/collector-adapter.ts`, offline CLI —
`scripts/import-collector.ts`. Новых зависимостей нет.

## Повторение без сетевых и модельных вызовов

Нужны локальные `data/normalized/astana/{places,reviews,report}.json` и пять
`*-items.json` / `*-run.json` в `data/raw/apify`. Они исключены из Git. При отсутствии
источника CLI отказывает; скрытой замены synthetic fixture нет. Runtime проекта —
Node 24.21.0 и pnpm 11.0.8.

```sh
# Сначала отдельно проверить все 36 отобранных ID; временно создаёт каталог из 36.
pnpm exec tsx scripts/import-collector.ts --slice reviewed36
# Затем сформировать окончательный полный каталог.
pnpm exec tsx scripts/import-collector.ts --slice full
# Повторение должно дать тот же SHA-256 и идентичные JSON, без нового timestamp.
pnpm exec tsx scripts/import-collector.ts --slice full
pnpm exec vitest run tests/unit/collector-import.test.ts
```

Можно задать `--input-dir`, `--raw-dir`, `--output`, `--report`. Выходы должны быть
различными и находиться вне source directories. CLI проверяет fingerprints,
число raw records и наличие успешных run metadata; неверный или пустой manifest
не позволяет заменить каталог. В итоговом report три verification flags = true.
Общий импорт уже нормализованного Catalog остаётся отдельным `scripts/import-poi.ts`.

## Проверенные количества

| Gate | Принято | Отклонено | Выдержек | Категорий / исходных районов |
|---|---:|---:|---:|---:|
| Отобранные 36 | 36 | 0 | 72 | 3 / 3 |
| Полный snapshot | 298 | 0 | 591 | 7 / 6 |

36 ID зафиксированы в `REVIEWED_PLACE_IDS`; report отдельно подтверждает все 36,
без пропусков: cafe 19, museum 10, park 7; Есиль/Нура/Сарайшык — по 12.
Все четыре demoGate checks полного каталога проходят.

Полный single-category mapping: cafe 135, restaurant 33, park 11, museum 21,
bowling 4, entertainment 46, other 48. Выбирается распознанная primaryCategory,
затем явная поддерживаемая secondary category в исходном порядке. Gym/coworking
без поддерживаемой категории остаются `other`; enum контрактов не расширен.
Report сохраняет результат mapping для каждого ID.

Исходные районы: Есиль 89, Нура 111, Сарайшык 30, Алматы 37, Сарыарка 25,
Байконыр 6. Это labels листинга, а не независимо проверенные полигоны города.
Проверяется city/region и sanity box Астаны; координаты не подменяются центром.

Дубли source ID отклоняются целиком. Три пары разных source IDs с совпадающим
нормализованным именем и расстоянием ≤50 м записаны в suspectedDuplicates:
Kinopark, Шашлычок, PINGWIN Premium. Они не объединены автоматически.

SHA-256 полного `places.json` (UTF-8, pretty JSON + newline):
`c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`.
Хеш среза 36:
`3f5739046c3cfa0a705c248d23b7f6b1b945d98c75f11e8312597870d24e61be`.
При изменении входного снимка сверять текущий report, а не ожидать эти хеши.

## Неизвестные свойства и безопасные ссылки

- Price=null у 298 POI, facts=[] у 298. Средний чек источника не становится
  гарантированным максимумом посещения на человека; парк не объявляется бесплатным.
  Строгий бюджет с неизвестной ценой исключает место по контракту продукта.
- Rating=null у 3 POI, hours=null у 6, address=null у 10. Рейтинг берётся из
  пары branch rating/ratingCount, отдельно от небольшой выборки отзывов.
- Расписание требует все 7 исходных day keys. `24:00` преобразуется в `00:00`
  с overnight=true; `00:00-24:00` — 24 часа. Ночные и split-shift интервалы
  сохранены. Неизвестные часы остаются null, malformed hours дают reject reason.
- 167 HTTP websites исключены: website=null у всех 298. Scheme не переписывается.
  354 social profiles проходят HTTPS/host whitelist без credentials/secret query.
  Исключены 264 WhatsApp/Viber contact-channel URL и ещё 6 URL с контактным
  email/phone-like path; из 791 входного website/social URL исключены 437. Listing
  links учитываются отдельно: 298 исходных HTTPS URL 2ГИС.
- В выходе только поля Poi, никаких phone/email/author/profile/avatar/photo полей
  или ownerReply. В report reasons и ID, без исходных payloads, URL секретов и PII.

## Отзывы и первичные источники

Проверены все 1953 normalized opinions. Каждый однозначно связан с исходной raw
записью по provider/reviewId/placeId/runId/scrapedAt/исходному тексту/дате. Из неё
восстанавливаются `placeUrl` и `likesCount`, которых нет в normalized review.
Все 1953 проходят; 591 выдержка экспортирована, 1362 опущены по лимиту max2/POI.
У 2 POI нет отзывов; у 1 — одна выдержка.

Выдержки буквальные, максимум 240 UTF-16 code units, заканчиваются на границе
слова, без LLM-пересказа и добавленных многоточий. Текст без границы слова внутри
лимита или с очевидным email/телефонным контактом исключается с причиной.
Порядок — исходный relevance sample, без выбора только положительных мнений.
В UI требуется подпись «Выдержка отзыва»; это мнение, не подтверждённое свойство.

Для каждого review source сохранены collectedAt, исходная дата публикации и URL
страницы филиала. Это наблюдавшийся первичный URL, **не проверенный permalink
конкретного отзыва**; новые пути или якоря не придумываются. Все sourceIds
разрешаются внутри своего POI. Полные raw тексты не переносятся в новый catalog.
Недоверенный текст отзывов остаётся данными и не исполняется как инструкции.

## Ограничение использования

Наличие публичной страницы и scraper не устанавливает права на публикацию
фото/отзывов. Подтверждённого разрешения на публикацию review text в имеющемся
комплекте нет. Каталог подготовлен для локальной демонстрации; его не публиковали,
не загружали во внешние сервисы и не отправляли моделям. Фото не скачивались.
Публикационный gate остаётся отдельным решением; этот импорт его не закрывает.

Инструкции исходного сбора и маленького воспроизведения находятся в
`scripts/collect/README.md` и `data/README.md`. Текущая M1.3 не запускает сбор,
indexing или paid evals. Apify guard не заменяет будущий общий бюджет OpenRouter.
