# Исследование: переиспользование и модели

Проверено 19.10.2026. Исходники внешних проектов клонировались только в /tmp.
Ключи и платные API не использовались. Проверка сборки/fallback не означает
работоспособности полного продукта с внешними сервисами.

## Решение о переиспользовании

| Источник | Решение для MVP |
|---|---|
| Kompas | Независимо воспроизвести идеи provenance/search documents; не копировать код без лицензии |
| ReverseGPS | Взять принцип фильтры → ranking → объяснение; прямое копирование отложить из-за лицензии |
| TravelMate | Не переносить шаблон: несовместимый стек, воспроизведённые дефекты |
| shadcn/ui | Добавить выборочные MIT-компоненты |
| geolib | Использовать MIT getDistance для геофильтра |
| OpenRouter AI SDK provider | Допустимый Apache-2.0 адаптер, но для P0 достаточно небольшого server fetch adapter |

Ни один внешний application-файл пока не перенесён. Это решение о будущем
использовании, не список уже установленных зависимостей.

## Kompas

[Репозиторий на проверенном commit](https://github.com/TienDat8605/LotusHacks2026/tree/d1581a31e75a62373208564c16bae6f88ccfb77e).
Commit: `d1581a31e75a62373208564c16bae6f88ccfb77e`.
License/COPYING/NOTICE в tracked tree не обнаружены.

Проверки в изолированном checkout:
- `npm ci --ignore-scripts --no-audit --no-fund`: PASS, 530 packages.
- `npm run build`: PASS, TypeScript/Vite/PWA.
- `npm run lint`: PASS, 0 ошибок и 3 hook warnings.
- `go test ./...`: PASS, тесты в трёх пакетах.
- Python FastAPI TestClient с очищенным environment и заблокированной сетью:
  health/search/messages HTTP 200, режим fallback, 113 документов.
- UGC health: degraded, отсутствует ключ Interfaze.

Реальная реализация отличается от [Devpost](https://devpost.com/software/kompas-lw0bnk):
[FirestoreStore.search](https://github.com/TienDat8605/LotusHacks2026/blob/d1581a31e75a62373208564c16bae6f88ccfb77e/backend/services/app/firestore_store.py#L74)
читает коллекцию и считает cosine в Python; без Firestore используется lexical
retrieval. Frontend по умолчанию stub, пока VITE_API_MODE не равен real.

Воспроизведённые дефекты:
- [Токенизатор](https://github.com/TienDat8605/LotusHacks2026/blob/d1581a31e75a62373208564c16bae6f88ccfb77e/backend/services/app/chat_service.py#L380)
  убирает кириллицу. «тихое кафе в Астане» и бессмысленный запрос вернули одинаковые
  первые три места Хошимина со score 0.001. Это не корректное abstention.
- [buildPlan](https://github.com/TienDat8605/LotusHacks2026/blob/d1581a31e75a62373208564c16bae6f88ccfb77e/backend/internal/routes/service.go#L798)
  обрезает total до бюджета перед проверкой: probe дал leg=436 min,
  reported_total=120 min, accepted=true.
- При ошибке геокодинга «Astana Baiterek» превращается в искусственную точку
  `{lat:10.7719, lng:106.7086}` возле Хошимина.
- Assistant request не содержит user location/radius; structured citations отсутствуют.

Полезная идея: единый документ из имени, адреса, описания, evidence и URL
([reviews.py](https://github.com/TienDat8605/LotusHacks2026/blob/d1581a31e75a62373208564c16bae6f88ccfb77e/backend/services/app/reviews.py#L43)).
Для нас — стабильный ID, Unicode, явная география и provenance на уровне фактов.
Live OpenAI/Firestore/ORS/UGC и UI e2e не проверены.

Локальный audit bundle: `/tmp/aitu-kompas-audit-Q9FDE7/` содержит summary и probe logs.
Временные файлы могут быть удалены ОС; ключевые результаты сохранены здесь.

## ReverseGPS

[Исходники](https://github.com/curiousgeorge5465/ReverseGPS/tree/4170fc45220c3d2fa7cf0d9aa3aa253c201130cd),
commit `4170fc45220c3d2fa7cf0d9aa3aa253c201130cd`.
Связь с описанием [Devpost](https://devpost.com/software/reversegps) установлена
по совпадающим названию, описанию и стеку; прямой source link на Devpost отсутствует.

Next.js/TS/Tailwind + FastAPI. `python3 -m unittest discover -s tests -p test_engine.py -v`:
4/4 PASS. Full pytest, frontend build и live API не запускались.

Взять как архитектурную идею [детерминированное ранжирование](https://github.com/curiousgeorge5465/ReverseGPS/blob/4170fc45220c3d2fa7cf0d9aa3aa253c201130cd/app/engine/ranking.py#L192)
и отдельную генерацию объяснений после выбора реальных POI.
USD, Fahrenheit, miles/mph потребовали бы локализации. LICENSE отсутствует,
package license отсутствует, GitHub license=null; прямое копирование не планируется.

## TravelMate

Оба репозитория имеют Apache-2.0:
- [Frontend](https://github.com/Shashankss1205/TravelMate_Frontend/tree/10470f7e75b0ce3bc2da2f0f6c208e6682de1c22),
  commit `10470f7e75b0ce3bc2da2f0f6c208e6682de1c22`.
- [Backend](https://github.com/Shashankss1205/TravelMate_Backend/tree/986b5ad9801bfd49adba130610d5f90a5f84d987),
  commit `986b5ad9801bfd49adba130610d5f90a5f84d987`.

Frontend — CRA/JavaScript/Bootstrap/MUI, backend — Flask/ArangoDB/NetworkX.
`npm ci --ignore-scripts --no-audit --no-fund` PASS, 1407 packages.
`CI=true npm run build` FAIL: warnings-as-errors (unused imports, alt/title, ==).
Обычная сборка без CI не проверена. Python syntax compilation PASS.

Изолированные probes оригинальных AST функций, без внешних API, подтвердили:
- [main.py:520](https://github.com/Shashankss1205/TravelMate_Backend/blob/986b5ad9801bfd49adba130610d5f90a5f84d987/main.py#L520)
  вызывает функцию с двумя аргументами вместо одного: TypeError.
- [sanitize_key](https://github.com/Shashankss1205/TravelMate_Backend/blob/986b5ad9801bfd49adba130610d5f90a5f84d987/main.py#L254)
  превращает и «Астана», и «Алматы» в `______`.
- Frontend содержит localhost:5000 URLs; новый город строится через несколько
  внешних сервисов внутри запроса. Полный backend не поднимался.

Переезд и исправления этого стека добавят работу по сравнению с компактным MVP.

## Готовые библиотеки

- [shadcn/ui](https://github.com/shadcn-ui/ui/tree/ba1503c64472b82256d9de95e2e62c5901a38e8b),
  MIT. Выборочные Button/Input/Card/Sheet. Drawer подключать лишь если Sheet
  недостаточен: он добавляет Vaul, тогда как Sheet использует Radix Dialog.
- [geolib](https://github.com/manuelbieh/geolib/tree/143a7495e60fc6a077491bd7936bd7cb89ce73b5),
  MIT. Проверен TypeScript getDistance: расстояние по сфере, метры;
  это не маршрут и не ETA. Добавить граничные тесты нашего геофильтра.
- [OpenRouter provider](https://github.com/OpenRouterTeam/ai-sdk-provider/tree/1b22b05352cb0f9243a6c3fdd326038dd3705544),
  Apache-2.0. На проверенном commit версия 3.1.0 требует AI SDK 7/Node >=22/ESM;
  README указывает 2.9.1 для AI SDK 6. Для двух коротких серверных вызовов P0
  выбираем fetch adapter; если нужен streaming, зафиксировать совместимую пару.

Это static source/package/license audit; upstream test suites этих библиотек
не запускались. Версии устанавливаемых пакетов фиксируются в этапе 1.

## Модель для RAG

Универсального победителя для нашего русскоязычного геопоиска опубликованные
лидерборды не устанавливают. Retrieval и генерация проверяются раздельно.
[Vectara](https://github.com/vectara/hallucination-leaderboard) оценивает
галлюцинации при суммаризации документов, а не весь наш pipeline, геофильтры
или русский JSON. Результаты старого поколения не переносятся на новое.

Проверены OpenRouter live catalog/endpoints и вендорские страницы, без платных calls.
Предварительные кандидаты (USD за миллион input/output, обычный режим):

| Роль | ID | Input / output |
|---|---|---|
| Основной | `openai/gpt-6-luna` | $0.10 / $0.50 |
| Резерв другой семьи | `anthropic/claude-haiku-5.5` | $0.10 / $0.50 при prompt <=100k |
| Третий для сравнения | `qwen/qwen3.8-flash` | $0.15 / $0.47 |

Источники: [Luna/OpenRouter](https://openrouter.ai/openai/gpt-6-luna),
[Luna/OpenAI](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Haiku/OpenRouter](https://openrouter.ai/anthropic/claude-haiku-5.5),
[Haiku/Anthropic](https://platform.claude.com/docs/en/models/haiku-5-5/overview),
[Qwen/OpenRouter](https://openrouter.ai/qwen/qwen3.8-flash),
[каталог](https://openrouter.ai/api/v1/models).
Объявленных ближайших отключений у выбранных кандидатов не обнаружено;
expiration_date=null не означает вечную доступность.

JSON Schema поддерживается соответствующими endpoints. В адаптере нужны
`response_format.type=json_schema`, `strict=true`, `provider.require_parameters=true`;
проверять capabilities конкретного provider. [Документация](https://openrouter.ai/docs/guides/features/structured-outputs).
Schema не гарантирует правдивость — ID/evidence и факты проверяются отдельно.
Reasoning отключён/минимален в соответствии с поддержкой модели; не менять
провайдера/модель в сравнении без записи в журнале.

4000 input + 1000 output суммарно за поиск: Luna/Haiku ≈$0.0009,
300 поисков ≈$0.27. Это арифметическая оценка, не benchmark и не фактический расход;
reasoning, audio, retries, cache writes и региональные тарифы могут его увеличить.

Embeddings baseline: [text-embedding-3-small](https://openrouter.ai/openai/text-embedding-3-small),
$0.02/M. Альтернатива для RU/KK: [Qwen3 Embedding 8B](https://openrouter.ai/qwen/qwen3-embedding-8b),
$0.01/M; [отчёт автора](https://qwenlm.github.io/blog/qwen3-embedding/) описывает
многоязычный retrieval. На нашем корпусе превосходство не проверено.
Индексы разных моделей не смешиваются.

В этапе 4: 12 русских real-cases, опционально 4 казахских; одинаковый кандидатный
контекст, три генератора. Сначала фильтры/валидность/grounding, затем задержка/цена.
Ни один из этих кандидатов ещё не запускался на данных проекта.

## Источники подхода к harness

[OpenAI Cookbook](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex),
[walkinglabs](https://github.com/walkinglabs/learn-harness-engineering),
[kmshdev](https://github.com/kmshdev/codex-harness),
[namojo](https://github.com/namojo/codex-harness).
Использованы идеи коротких инструкций, плана, критериев и журнала; чужие CLI,
skills и большие orchestration workflows не устанавливались и не копировались.
