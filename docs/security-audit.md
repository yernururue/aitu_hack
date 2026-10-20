# Проверка датасета и утечек ключей

Дата: 20.10.2026, Asia/Almaty. Проверена Git-история до `3751584` включительно
(12 коммитов), приложение source `ceb34a5`, build `NASkuokYCKTpTbx_JqKpo`.

**Итог:** в проверенных локальных данных, Git-истории и фактически отдаваемых
клиентских файлах совпадений с локальными ключами или подтверждённых секретов
не обнаружено. Локальная проверка и origin — PASS в указанных границах.
На момент M7.7 прежний внешний адрес — UNVERIFIED/WARN: DNS-имя QuickTunnel не разрешилось с машины аудита;
получено 0 публичных HTTP-ответов. Это не доказательство состояния адреса из других сетей.

Независимый review: LINEAGE PASS и LOCAL/ORIGIN SECURITY LIMITED PASS;
PUBLIC DNS WARN/UNVERIFIED. Открытых actionable findings нет. Проверены
25 checksums audit-evidence, оба replay output, byte hashes всех 12 origin-assets,
redaction/guard и права .env.local. Обнаруженный недостаток предварительного URL-guard
исправлен до HTTP-прохода и подтверждён тестами на синтетических значениях.

## Какой датасет используется

`data/normalized/astana/` — источник импорта. Приложение читает его проверенную
производную `data/catalog/places.json` через `loadCatalog()`.

- Все 298 уникальных ID мест полностью совпали; отсутствующих и лишних мест нет.
- Проверены все 1953 нормализованных отзыва и их связи с raw-источниками.
  В приложение включена 591 буквальная выдержка, максимум две на место и
  240 UTF-16 единиц; 1362 отзыва опущены по лимиту.
- В исходной папке 6 файлов, CSV содержит 298 логических строк. Quarantine с 223
  записями остаётся отдельно. Пять raw fingerprints и метаданные успешных запусков
  проверены среди 40 файлов raw/apify.
- Все цены и подтверждённые удобства остаются неизвестными. Имена, координаты,
  рейтинг и источники сверены с входными записями; LLM не использовалась.

После локального security PASS и независимой проверки метода импорт один раз
повторён с выходами исключительно во временную папку. Каталог и import-report
побайтово совпали с принятыми файлами; все исходники остались неизменными.

| Артефакт | SHA-256 |
|---|---|
| Normalized places.json | `4f6ad183f35bd0545640b49d4b654bf191192b175cdda497864fff3e960d4454` |
| Normalized reviews.json | `3a50bd1f9e57d542c073dad1f44268c2683bec17b89655b859340d0a5cae9c8f` |
| Каталог приложения | `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873` |
| Import-report | `1b287c672b10ce1ba8fce8863837ea1b2219199c1e96a1111a224aa357073c67` |
| Canonical runtime snapshot | `4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6` |

## Проверка ключей

Значения двух локальных серверных credentials сравнивались только в памяти:
без вывода значений, фрагментов, credential-fingerprints или содержимого .env.
Проверены обычные JSON/URL/base64-представления, известные форматы токенов,
private-key markers, credentials в URL, чувствительные query/fragment поля.

- 169 текущих файлов: normalized, raw, отслеживаемые файлы и вся `.next/static`.
- Все 12 коммитов и 207 уникальных исторических Git blobs; 118 членов ZIP/PPTX,
  включая распакованные XML/relationships.
- Подтверждённые совпадения с ключами: 0. High-confidence секреты: 0.
  Неразобранные кандидаты после проверки: 0. Общие срабатывания оказались
  намеренными тестовыми fixtures и константами browser/framework.
- Выполнены 13 проверок защитного HTTP-guard на синтетических значениях.
  URL проверяется до GET; redirects не следуются; обнаружение секрета останавливает
  последующие запросы. В запросы сканера ключи не подставлялись.
- Origin `http://127.0.0.1:3000`: 72 ответа, все 12 клиентских файлов получены
  (11 JS и 1 CSS), все 9 ссылок из HTML покрыты. Из 55 приватных путей 51 сразу
  вернул 404; четыре directory URL дали Next308, их канонические варианты — 404.
- `.env.local` и normalized/raw исключены из Git. Права `.env.local` дополнительно
  изменены с 0644 на 0600; значения не редактировались. В репозитории опубликован
  очищенный каталог, а не исходная normalized/raw папка.

На момент M7.7 прямые публичные HTML/assets/private404 не были подтверждены:
прежний внешний DNS был недоступен из среды аудита. Этот receipt сохранён.
Восстановление нового адреса и отдельная публичная проверка описаны ниже.

## Границы и дальнейшее использование

Это проверка конкретных байтов и перечисленных представлений; она не доказывает
отсутствие произвольной обфускации или неизвестных credentials. OCR изображений,
проверка валидности ключей и обращения к OpenRouter/Apify не выполнялись.

Сканирование нужно повторить при изменении входных данных, .env или сборки,
прежде чем передавать данные провайдерам или публиковать новую версию. Действующие
на момент M7.7 действовали stubs, paid/eval off и расход$0; обновление ключа и
последующий диагностический тест отражены в отдельном дополнении M2.6 ниже.

Приватные скрипты, redacted receipts и подробные отчёты сохранены локально:
`/tmp/aituhack-mvp/dataset-secret-audit/` и
`/tmp/aituhack-mvp/dataset-lineage-audit/`.

## Дополнение M7.8: новый публичный адрес

20.10.2026 около14:12 Asia/Almaty восстановлен только туннель:
[текущий HTTPS-адрес](https://loan-begins-sleeps-unavailable.trycloudflare.com).
Новый tunnel80285, прежний64556 остановлен после успешной проверки замены.
Origin70029, sourceceb/buildNASku, каталог и .env содержимое не изменялись.

Новый publicGET-проход использовал тот же known-secret guard перед каждым URL
и проверку тела ответа:12из12clientassets200 byteEXACT,9HTMLrefs покрыты,
51private404+4directory308→отдельныйcanonical404,GET API405. Подтверждённых секретов0.
Три текущих лога mode0600/canariesabsent; auth/provider/paid-вызовов0.
Это отдельная проверка новогоURL, а не изменение исторического verdict M7.7.
[Проверки доступности](submission/links.md) и [готовность](readiness-report.md).
Локальные redacted receipts: `/tmp/aituhack-mvp/public-restore-20261020/`.

## Дополнение M2.6: обновлённый ключ и диагностический тест

После подтверждения обновления `.env.local` выполнен новый in-memory known-secret
scan:2server credential sources,131files/59ZIP members, findings0. Значения, префиксы
и credential hashes не выводились. Права.env0600; никаких NEXT_PUBLIC secret vars.
После ровно3guarded POST проверены46private artifacts, command logs и канонический
ledger: совпадений0. При этом Git/full-history аудит M7.7 остаётся историческим;
новая проверка имеет перечисленные границы. Source/build/catalog не менялись.
Known charge$0.00024488,3settled, unknown/inFlight/reserved0; publicstub сохранён.
[Тест, наблюдаемый alias blocker и план](live-p0-plan.md).

## Дополнение live-кандидат270b427

20.10.2026 18:31 новый known-key in-memory scan выполнен после новой сборки:
252файла/59ZIPmembers/30.7MB, включая trackedsource/catalog/index и `.next/server`
и `.next/static`. Findings0, env0600; значения/префиксы/credentialhashes не выводились.
Receipt `/tmp/aituhack-mvp/release-source-scan-20261020/fresh-secret-scan.json`.
StrictNFTgate:6traces/1569entries, actualcatalog/index включены; raw/normalized/
private/cache/query/ledger/collector исключены. Новый source270b427 пока не опубликован
как live. Это не повтор всего исторического Git-audit; scope указан явно.

Рабочий stubURL заменён на [новый адрес](https://stats-corps-watt-reviews.trycloudflare.com).
Origin70029/sourceceb/buildNASku неизменён, новыйtunnel7982; старый80285 остановлен
после HTTPSproof.12currentassets byteequal,59privatepaths closed/API405/secretguardsPASS.
Независимыйreview нашёл подавление AuditBlocked в приватном readinessprobe: original
executor исправил fail-fast, повторный guarded sweep78GET/re-review SPEC/QUALITY PASS принят20.10 18:33.
Платных/провайдерских вызовов при восстановлении0. Raw/collector не менялись.

## Исторический AI-кандидат93bc531,20.10 19:44

Freshknown-keyscan252tracked/catalog/index/server/staticfilesи59ZIPmembers,
30.84MB:findings0/.env0600,0network. ЗначенияOPENROUTER_API_KEY/APIFY_TOKEN
сравниваливпамяти/обычныеencodedvariants; не печатали и не сохранялиhashключа.
NonsecretLIVE_EVAL_MAX_USD.80→1.00менялсяатомарно, остальныеcredentialbytesсохранены.
Source93bc531/buildiXq-eM5ZeUgXm75TRI3m8; strictNFT6/1569includesrealindex,
excludesprivatecache/querycache/ledger/raw/normalized/env. Freshreceipt600
`/tmp/aituhack-mvp/release-source-scan-20261020/source-93bc531-secret-scan.json`.
Это проверкаконкретныхбайтов, не доказательствоliveP0; новыйLunatimeout/no-cost
остановилpaid. Публичнымостаётсяпроверенныйstub, не этаAI-сборка.

## Новый offline кандидат3410a4a,20.10 21:53

Root: lint/typecheck/52 targeted tests/build PASS, BUILD_ID fKShKXBBTO6GrZDupxTsU.
Strict NFT6traces/1569entries включает каталог и настоящий индекс, исключает
private/raw/normalized/env/cache/collector tooling. Автор full923unit PASS.
Fresh known-key scan253files/59ZIP/30,892,336bytes: findings0, .env0600,
0network. Проверены текущие серверные credentials только в памяти, без значений
или hash ключей в выводе. Immutable receipt
`/tmp/aituhack-mvp/release-source-scan-20261020/source-3410a4a-secret-scan.json`.
Источник не опубликован live; независимое ревью pin SPEC/QUALITY PASS (344 targeted). Новый canonical
unknown Qwen429 сохраняет paid STOP. Предыдущие scanned snapshots сохранены.

## Восстановление текущего donate URL,20.10 22:00

После DNS-отказа stats используется
[новый HTTPS URL](https://donate-cooperation-quick-annual.trycloudflare.com).
Неизменённый origin70029/sourceceb34a5/buildNASku обслуживает новыйCF39251.
Автор234GET(156origin78public)/12assetsbyteequal/59privatepathsclosed/API405,
credentialformats0; root дополнительно14current-known-key guardedpublicGET:
2credential sourcesinmemory/0matches/12assetsbyteequal/no values-keyhashesprinted.
ОтдельноrootavailabilityGET200, reviewer19freshGET/12assetsbyteequal/targetedprivatepaths
и процессныеграницыPASS. UI390/1440дваactualSTUBPOST, оба3realparks/no-store,
details/sources/maps/focus/overflowPASS; fourPNGs reviewed. IndependentjointSPEC/QUALITYPASS.
GET405 Cache-Control отсутствует; POSTno-store проверено actualUI, не выведено изGET.
ПослеPASS root завершил только старыйCF7982; origin70029/новый39251 сохранены.
Новый physicalphone/liveAI не заявлены. Новыйrootproof и reviewedpackets:
`/tmp/aituhack-mvp/public-stub-restore-20261020T1658Z/`,
`/tmp/aituhack-mvp/public-stub-browser-20261020T1700Z/`.
