# Индекс и измерение retrieval

20.10.2026 M2.4/M2 приняты. Построен настоящий индекс всех298POI, модель
`openai/text-embedding-3-small`,1536finite/nonzeroизмерений. Адаптер принимает
только exactslug либо проверенное nativeимя `text-embedding-3-small`; проверки
полноты/индексов/размерности сохранены. Syntheticvectors в production не используются.
Публичный сайт пока stub, новые платные вызовы остановлены из-за отдельного
unknowncost при сравнении chatмоделей. Не запускать indexing повторно ради проверки.

## Принятые артефакты

| Артефакт | SHA-256 |
|---|---|
| Index298POI×1536 |568c855ff30dc866c8de4f0eed3038df4406898bd45fe25472f5afa318934d45|
| Documentcache |e1b9938d840c61e8f1f8c0cf017686038d7c77f3179bc50aadb0d67d62ec571e|
| Querycache12vectors |2788286068ef9d7d45e00ead9cf30c18de7ca6258acd939cc07c89e6b0cc38eb|
| Canonicaldataset |4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6|

Пути `data/index/places.json`, `cache.json`, `query-vectors.json` локальные,
игнорируются Git. Документы versionpoi-v1:298мест/274uniquehash/24dedup,
45770UTF-8bytes/max398bytes, без сырых отзывов и URL. Реальные9indexbatches стоили
$0.000225041;12queryvectors$0.00001026. Эти суммы уже включены в canonicalledger.
Cache replay298reused/0embedded/0execute/0POST, index/cache/ledger неизменны.

Кеш документа связан с model/dimensions/documentVersion/documentHash; checkpoint
сохраняется до следующего batch. Кеш запросов хранит raw-queryhash и vector,
без текста. Sourcecatalog/labels/cache/index защищены от совпадения путей/symlink.
Итоговый index появляется только после полной проверки. NFT releasegate включает
точно index, исключая documentcache/querycache/ledger/raw/normalized/collector/env.
`pnpm check:build-artifacts --require-index` PASS6traces/1569entries; cleanstubCI
может не иметь локальногоignoredindex и проходит обычный gate.

## Свежие offline проверки

```sh
pnpm build:index
pnpm eval:retrieval
```

Первая команда без execute — сухой прогон без сети и записи. Вторая использует
неизменные12RUpositives/4negativeguards и принятые локальные queryvectors,0paidPOST.
Exit0:12/12positives semantic/top3hit,macroRecall5=.9722222222222222,micro=.9375,
negative4/4,allhardPASS,semanticVerified=true/acceptancePassed=true. Отрицательные
кейсы дают0 по hardfilters до embedding; их lexicalcachemiss не ослабляет условий.

97.22% — потолок этого agent-curated developmentset: два релевантных набора
содержат6IDs,top5можетвместить5. Это не blindbenchmark. UIintent фиксирован,
качество LLMразбора здесь не измеряется; goldIDs/tags не попадают в retrievalprompt.
Предыдущий lexicalрезультат M4.2 тоже12/12/97.22%; исходный был11/12/88.33%.
Supplemental RAGOps acceptedlexical→semantic compare PASS,Recall97.22→97.22%,
failedgates[],12RUdenominator/4guards unchanged,0provider/network. Генерацию и
citationquality этот compare не доказывает. Отдельные4KKlexicalprobes4/4/91.67%,
native-speaker/liveKK не проверены.

Model/dimensions/cataloghash/полныйнаборIDs проверяются перед semanticsearch;
несовместимый/неполныйindex даёт явный lexicalfallback с теми же hardfilters.
Будущие платные команды execute/prepare-queries допустимы только после снятия
текущего unknowncostблокера и headroompreflight через прежнийsinglehostledger.
Нельзя переинициализироватьledger, снова оплачиватьcachedдокументы или расходовать
demoрезерв на dev. [Бюджет](budget.md), [выбормодели](model-decision.md),
[текущаяпередача](handoff.md), [real labels](evaluation-labels.md).
