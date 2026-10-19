# Комплект автоматизированного сбора

Исходная реализация сохранена на месте: [`../collect_astana.py`](../collect_astana.py)
и [`../astana_data.py`](../astana_data.py). Это Python 3.10+ standard-library
workflow через официальный REST API Apify; отдельная установка зависимостей не
нужна. Код не дублируется и не перемещается. Полный порядок и ограничения —
[`../../data/README.md`](../../data/README.md); результаты адаптации —
[`../../docs/collection-import.md`](../../docs/collection-import.md).

Источник: 2ГИС, Actor `kyungminlee/twogis-places-reviews-scraper`, pinned build
0.1.13. Сохранённые планы без ключей — `data/collection/`, журнал успешных runs,
схема, raw datasets и хеши — локальные `data/raw/apify/` и normalized report.
Сборщик исключает author/profile/avatar поля при сохранении отзывов. В каталог
приложения переносится только whitelist полей и max2 короткие выдержки на POI.
Права публикации отзывов/фото не установлены; эти файлы сами не дают разрешения.

## Маленькое воспроизведение полностью офлайн

```sh
# FakeApi использует только unittest/tempfile; реального клиента или сети нет.
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_collect_astana.py' -v
# Офлайн проверка очистки и данных; fixtures намеренно synthetic, только для tests.
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_astana_data.py' -v
# Пересоздать отдельный Catalog из уже сохранённых данных, не вызывая сборщик.
pnpm exec tsx scripts/import-collector.ts --slice reviewed36
pnpm exec tsx scripts/import-collector.ts --slice full
```

## Маленькая реальная выборка — только при отдельном разрешении расходов

Ниже инструкция будущего воспроизведения; в M1.3 эти команды не выполнялись.
Не запускать её автоматически: даже inspect/fetch обращаются к сервису и могут
расходовать кредит чтения. APIFY_TOKEN нужен только в локальном серверном env;
не передавать ключ в CLI/URL, не включать в JSON план и не печатать `.env`.

После явного разрешения пользователя проверить FREE-план, остаток общей задачи
сбора $2, отсутствие незавершённого Actor/POST, цены/build и допустимость источника
по исходному README. Существующий guard резервирует $0.015 на чтение/передачу и
отказывает при неизвестной стоимости или лимитах. Бюджет модели это не увеличивает.

Пример локального `data/private/astana/small-plan.json` без секретов:

```json
{
  "actor": "kyungminlee/twogis-places-reviews-scraper",
  "build": "0.1.13",
  "input": {
    "city": "astana",
    "searchQueries": ["музеи"],
    "maxPlacesPerQuery": 2,
    "includeContacts": true,
    "maxReviewsPerPlace": 1,
    "includeReviewPhotoUrls": false,
    "proxyConfiguration": {"useApifyProxy": false}
  },
  "runOptions": {
    "build": "0.1.13",
    "maxTotalChargeUsd": 0.02,
    "restartOnError": false
  }
}
```

```sh
python3 scripts/collect_astana.py inspect
# После проверки текущей схемы/цены и реального разрешения расходов:
python3 scripts/collect_astana.py start --plan data/private/astana/small-plan.json --label small-new --approved-spend
python3 scripts/collect_astana.py fetch --label small-new --wait
# export перезаписывает только поставку сборщика; сначала проверить raw summary.
python3 scripts/collect_astana.py export
```

Лимит $0.02 передаётся исходным сборщиком как отдельный API query parameter,
не как поле Actor input; серверный cap проверяется. Использовать новый label
можно только после сверки предыдущих запусков. POST не повторяется автоматически,
при неоднозначном сбое сначала сверить запуск. Подмены proxy, обходов отказов и
загрузки фотографий в примере нет. Результат сбора не считается готовым Poi:
после него заново запустить отдельный адаптер, проверить report и все gates.
