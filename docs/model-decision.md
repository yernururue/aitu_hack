# Модель и качество: текущее решение

Live-модель **не выбрана**. В проверенном демо `APP_AI_MODE=stub`:
пять известных фраз разбирает детерминированный parser, поиск лексический,
объяснения берутся из шаблонов. Реальные POI, часы, рейтинги и ссылки — из каталога.
`OPENROUTER_MODEL=openai/gpt-6-luna` остаётся предварительной конфигурацией,
а не победителем сравнения. `OPENROUTER_FALLBACK_MODEL` автоматически не используется.

## Почему live-сравнение не выполнено

Ключ обновлён: auth200, отдельные intent/explanation GPT‑6 Luna/OpenAI прошли
HTTP200 и локальные schema/evidence проверки. Кампания3POST стоила$0.00024488.
Embedding endpoint200 вернул native имя и был остановлен адаптером до1536 validation.
Это диагностические наблюдения, не full3-model comparison/выбор победителя.
M3.4 runner реализован и проверен stubs, default `pnpm eval:live` отключён и
не обращается даже за metadata. Фактические model/provider/usage известны только
для этих diagnostics; TTFT=null (non-streaming), full-comparison metrics ещё нет.

Локальный консервативный резерв одного explanation attempt, по зафиксированным
ставкам pricing module от19.10.2026 (это **не фактическая стоимость**):

| Кандидат | Reserve USD |
| --- | ---: |
| openai/gpt-6-luna | 0.358500001 |
| anthropic/claude-haiku-5.5 | 1.32 |
| qwen/qwen3.8-flash | 0.21160384 |

Haiku не проходит вложенный live-eval cap$0.50. Полный набор блокируется до
metadata/provider, даже при исправленном ключе. Лимиты не увеличивались, $4 демо
не расходуются на подготовку. Более точный резерв требует отдельного доказанного
полного token bound; диагностическое подмножество не считается сравнением трёх моделей.
Общий ledger создан0600 и содержит3known settled entries; публичный paid mode выключен.

## Измеренный поиск по словам

Неизменные12RU positives и4negative guards, реальный каталог298 POI:

| Проверка | До | M4.2 |
| --- | ---: | ---: |
| Top-3 success | 11/12 | 12/12 |
| Macro Recall@5 | 88.33% | 97.22% |
| Micro Recall@5 | 81.25% | 93.75% |
| Negative guards | 4/4 | 4/4 |
| Hard constraints | PASS | PASS |

97.22% — потолок этого development set: два запроса имеют по6 релевантных ID,
а top-5 содержит максимум5. Источник labels — agent-curated разметка, не слепой
human benchmark. Общие stopword/content-term и RU inflection изменения проверены
13 поведенческими regression cases; веса, профили и gold не менялись.
Отдельные4KK probes:4/4top3,91.67%macro; native-speaker и liveKK не проверены.

RAGOps supplemental compare с исходным12RU denominator и порогом90%:
PASS, +8.89п.п. Recall, network/provider0, cost0. Его пустые answer/citation поля
не используются как доказательство grounding. Основной runner по-прежнему exit1:
`qualityGatePassed=true`, **`semanticVerified=false`, `acceptancePassed=false`**.
Настоящего embedding index нет; фиктивные векторы из tests в production не внесены.

## Что проверено и что остаётся

Synthetic fault-injection tests проверяют unknown POI/evidence ID, неверный JSON,
сбой/обрыв/429, deadline, конфликт фильтров, mandatory quiet и противоположные
amenity assertions. Это проверка программных инвариантов, не реальные ошибки модели.
Валидатор консервативен, но не доказывает смысловую корректность произвольной прозы.

Следом: исправить verified native-alias validation, создать индекс через общий guard, проверить semantic retrieval,
затем получить допустимый резерв и выполнить все три модели на одном frozen context.
Сначала correctness/grounding, затем latency, затем cost. До этого M2.4 и M4.3–M4.4
остаются blocked; профили/подробности/маршруты реализуются независимо со stubs.

Артефакты локально: `output/evaluation/M4.2-root-retrieval.jsonl`,
`M4.2-kk-supplemental.json`, `ragops-snapshot/candidate-review.md` и checksums.
Исходные хеши каталога и RU labels см. [evaluation-labels.md](evaluation-labels.md).
