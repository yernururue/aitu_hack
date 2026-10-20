# Модель и качество: текущее решение

20.10.2026. Рабочая live-модель **не выбрана**, fullP0=false. Публичный сайт пока
`APP_AI_MODE=stub`, paid=false: пять известных фраз, лексический поиск и шаблонные
объяснения. Каталожные факты/карты/источники настоящие. Конфигурация Luna остаётся
предварительной, автоматического fallback model нет.

## Реальный RAG принят

Исправленный адаптер принимает только проверенную пару OpenRouter slug/native
`openai/text-embedding-3-small` / `text-embedding-3-small` и сохраняет валидацию
1536finite/nonzero/полноты/IDs. Построен реальный index298POI/274uniquehashdocuments,
12cachedqueryvectors. Synthetic vectors в production не внесены.

Fresh `pnpm eval:retrieval` exit0:12/12semantic/top3hit, macroRecall5=.9722222222222222,
micro=.9375,4negative guards/всеhardfilters PASS, acceptancePassed=true.
Gold12RU/32source refs не менялись. Это agent-curated development set, не blind
benchmark. Отдельные4KK lexicalprobes4/4/91.67%, native-speaker/liveKK не проверены.
RAGOps supplemental acceptedlexical→semantic compare PASS: Recall97.22→97.22%,
failedgates[],0provider/network; генерацию/цитатную корректность это не подтверждает.

## Сравнение трёх моделей начато и остановлено

Full3model source/review принят: одинаковые frozen semantic contexts≤8POI/case,
12RU positives,4negativeguards отдельно, source-first intent expectations, строгие
исходные schemas/corevalidators, usage/latency/retries/policy/hash attribution.
Каждая попытка получает reviewed full-context/full-output budget reserve.

| Кандидат | Reserve USD | Особенность wire |
|---|---:|---|
| openai/gpt-6-luna | .384750001 | identity / provider-default reasoning |
| anthropic/claude-haiku-5.5 | .264 | только azure/global,hardmaxprice,no fallback;anthropic-bounds-v1/reasoningdisabled |
| qwen/qwen3.8-flash | .26160384 | identity / provider-default reasoning |

Это верхние оценки, не реальные списания. Caps менялись только по отдельным явным согласиям; текущие2/1.5/4. Native Haiku
projection снимает неподдержанные bounds только на wire, исходная Zodvalidation
сохраняется. Read-only проверка actualschemas не нашла точного документированного
нарушения regex/refs/format/required/APfalse; историческую причину ошибки не угадали.

Первый фактический full3campaign от71ac дал4attempt rows для REAL-RU-01:

| Попытка | HTTP/проверка | Latency ms | Known USD |
|---|---|---:|---:|
| Luna intent |200/schemaPASS, intentMatch=false: лишнее уточнение EXPO |5381|.000173|
| Luna explanation |200/schema+groundingPASS |7866|.000353425|
| Haiku intent |200/schema+intentPASS |2798|.0001778|
| Haiku explanation |COST_UNKNOWN,status/id утрачены |1178|unknown|

При неизвестной стоимости guard остановил campaign и все дальнейшие paid calls.
Qwen0calls, comparisonComplete=false/winner=null. Не выбирать лучший subset.
Frozen JSONL SHA `2cfe24e17f1ef742866afda6211e3751a1071f89bbd0a94edc66291fec830db0`.
TTFT=null (non-streaming). Первая Luna correctnessfailure не маскируется schemaPASS.
Commit270b427 сохраняет safeHTTPstatus/gen-id/reason при будущих ошибках, оставляя
unknownSTOP/no retry. Утраченный receipt он восстановить не может.

## Изменённая приёмка и текущий блокер

Сначала пользователь разрешил исключить технически не прошедшую Haiku/Azure
и проверить Luna/Qwen 48 этапов; затем, после первого Luna15s timeout,
разрешил Qwen на всех 12 RU запросах, intent+explanation=24 этапа.
Исходные 72 и 48 не завершены. Haiku: первый отказ opaque, второй HTTP400;
Luna: текущий15s SLO не пройден. Полная семантика этих моделей не оценена.

Named `approved-qwen-20261020` имеет отдельный `qwenQualificationComplete`;
исходные comparison flags остаются false. Те же semantic contexts/gold,
strict schemas/prompt v2 и trusted preset origin. Skipped не измерение.
Winner автоматически null, human review обязателен.

Первый Qwen24 на bd8e3da остановился21:42 на первом intentHTTP429. После четвёртого точного согласия canonicalv4→v5 сохранил все прежние записи, четыреactualnullupperbounds$1.174353841/caps2/1.5/4. Затем разрешённый новый USQwen24 sourcef864 также остановился22:25 на первом intentHTTP429/no cost:1POST/0retry, объяснений нет. Exactgeneration GET404 не доказываетactual0. Новый пятый unknown c54e0818…/резерв$0.26160384/uncertaintrue сноваSTOP; отдельного пятого согласия нет. Оба прогона технически не завершены; семантическое качество Qwen не оценено, winnernull.

Последний source9503/build4YqxpEYHmL2S8AGyUVa0R принят только offline:1002unit/38route tests/21inputplanchecks/rootlint-types-build-NFT/semantic12+4/scan0. Финансовая v5policy ранее отдельно принята на f864. Все releasecandidateGO false. [Финансовый статус](budget.md) и [трекер](../tracker.yaml) описывают текущее состояние.

## Подготовка одного альтернативного маршрута

После двух Qwen429 бесплатные официальные метаданные проверены для одного кандидата `mistralai/mistral-small-3.2-24b-instruct`, exact provider `deepinfra/fp8`, без fallback. Консервативный model-level envelope256000context/16384output при .09375/.25 за миллион даёт полный резерв$0.028096. Он помещается в оставшийся eval$0.062359229 для одного шага; сумма24 худших резервов$0.674304 не помещается, поэтому нельзя гарантировать завершение без per-attempt guard. Фактические цены сохраняются отдельно от резервов.

Метаданные объявляют structured_outputs/response_format/max_tokens, но не доказывают русский язык, фактическую grammar correctness,15sдоступность или liveкачество. Offline adapter/tests и metadata/math/source прошли независимый review; исходные defaults/CLI протокол не менялись. Кандидат не выбран и не разрешён к оплате. Смена приёмки и новый финансовый exception потребуют отдельного решения пользователя после конкретной подготовки. Исходные72/48 и Qwen24 останутся невыполненными.

Критерии новой приёмки не ослаблять: все12intent+explanation,100%IDs/evidence/hard filters,0 неподтверждённых фактов, минимум10/12 relevant positives,4negative guards и независимая ручная проверка каждого ответа. Затем private/public prep QA. Auth/schema/retrieval PASS отдельно не доказывают полныйP0.
