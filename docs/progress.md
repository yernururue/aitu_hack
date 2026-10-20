# Состояние проекта

## Текущий checkpoint: 20.10, 22:47 Asia/Almaty

Полный P0 с настоящим ИИ **не принят**. [Публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com) работает в stub-режиме с настоящим каталогом; произвольный текст и ИИ-объяснения ещё не опубликованы. Реальный сохранённый RAG принят локально: 298×1536, 12/12 top3, macro Recall@5 97.22%, micro 93.75%, четыре отрицательных сценария и hard filters PASS. Это development set, не слепой бенчмарк.

Четвёртое отдельное согласие пользователя применено ровно один раз и независимо проверено. Затем разрешённый новый Qwen US12×2 прогон остановился на первом intent: HTTP429, 1 POST, 0 повторов, стоимость неизвестна. Объяснений и качественной оценки нет, winner=null; оригинальные сравнения72/48 и Qwen24 не завершены. Закрепление US endpoint не устранило отказ.

Canonical ledger v5/35 записей/0600: 30 known, четыре approved upper bounds с actual=null и новый пятый unknown `c54e0818-1757-4752-a3cc-42299566784d`. uncertain=true, inFlight=0. Известный округлённый prep $0.001908131, включая eval $0.00168309; четыре бюджетные оценки $1.174353841 учтены по одному разу, они не являются восстановленной фактической стоимостью. Новый резерв $0.26160384; exposure prep $1.437865812/eval $1.437640771; доступно prep $0.562134188/eval $0.062359229/demo $4. Потолки $2/$1.50/$4 сохранены. Пятого согласия нет, все платные вызовы STOP. API принял ключ; отдельного лимита ключа не задано, кредит есть. Exact generation GET для `gen-1792517117-9rLmsCooRUs1A7VCZ6VY` вернул404; это не доказательство нулевой стоимости.

Последняя принятая offline сборка: source `9503af2b353d66cec6ea82d9d0e77656f15f2b5f`, BUILD_ID `4YqxpEYHmL2S8AGyUVa0R`. Автор1002unit, независимый reviewer38 Mistral/Qwen tests и21 frozen-input/plan checks, root lint/typecheck/build/strict NFT6traces1569entries/semantic12+4 PASS. Fresh known-key scan254files59ZIP/findings0, `.env.local`0600. Mistral/DeepInfra адаптер и отдельный план приняты только offline; defaults и приёмочный протокол не изменены, live-модель не выбрана. Подробности финансовой v5-политики отдельно проверены на f864.

Приоритет пользователя — сдача работающей версии сейчас. Нового финансового согласия не получено, платные попытки не продолжаем. Остаточный блокер M4.3: подготовлен ровно один альтернативный маршрут Mistral Small3.2/DeepInfra. Public metadata дают консервативный полный резерв $0.028096; metadata и offline adapter/tests прошли независимое ревью. Кандидат не выбран, финансового разрешения или разрешения нового приёмочного прогона нет. Повторы старых one-use операторов, guessedactual, reset/copy ledger, увеличение caps и расход demo на разработку запрещены.

Все принятые source/docs и новая презентация опубликованы в main: remote `e5b89ada0763f20f53196ce9ca7637f426dbf563` проверен20.10 22:51 Asia/Almaty,46commits, включая5новых после49fc. Следующий commit — только квитанция этой проверки; он тоже публикуется обычным push. Рабочий публичный сайт остаётся прежним stub. Root единственный writer tracker; исполнение и независимый review разными субагентами обязательны.

## История checkpoint до 22:38 — не текущий статус

## Действующий checkpoint20.10,22:19 Asia/Almaty

M4.3gDONE: sourcef86420b/980fullunit/57independentfourthpolicychecks PASS;
rootlint/typecheck/buildHb7uhVoLGIcoOW1rb5mv0/strictNFT6-1569/
semanticretrieval12+4/disabledlive0network PASS. Freshcurrentknownkeyscan:
253files/59ZIP/30,925,893bytes/findings0/.env600, immutable source-f86420b-secret-scan.json.
V5canonicalapplicationONCE17:17:55UTC, independent29actualchecksPASS;
34entries/4actualnullallocations1.174353841/capsUNCHANGED2-1.5-4/knowncostunchanged/
noreserve/inflight0/uncertainfalse/other33+prior3historypreserved. Availableprep
.823738028/eval.323963069/demo4. Noenvcapchange/provider duringaccounting.
NEXТM4.3: NEWQwenUS24operatorreview/ROOTGO/full12quality; no newmodelcallsyet.
Main25commits through49fc095pushedandremotelyverified; newerf864locallymerged.
CurrentdonatepublicSTUBjointreviewPASS, PIDs70029+39251, no newphone/liveP0proof.
Ниже сохранён checkpoint до четвёртого согласия и v5; его pending/STOP исторические.

> 20.10 22:00 Asia/Almaty: после DNS-отказа stats hostname новый публичный
> [адрес демо](https://donate-cooperation-quick-annual.trycloudflare.com) отвечает HTTPS200.
> Fresh390/1440: два настоящих stub POST и три карточки; independent SPEC/QUALITY review PASS.

Stage: implementation

Статусы — [tracker.yaml](../tracker.yaml).

**Полный P0 с ИИ ещё не принят.** [Публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com)
работает в режиме stub: 298 настоящих мест, строгие фильтры, до трёх карточек,
источники, подробности, демо-профили, сохранения и обе карты. Произвольный текст
и настоящие ИИ-объяснения на публичном сайте пока не включены.

Реальный RAG принят локально: индекс 298×1536, 12 cached query vectors,
12/12 top3, macro Recall@5=97.22%, micro=93.75%, все hard filters и четыре
отрицательных сценария PASS. Это development set, а не слепой бенчмарк.

Последняя принятая offline сборка: source3410a4a / BUILD_ID `fKShKXBBTO6GrZDupxTsU`.
923 unit автора и 344 независимых targeted теста PASS; root lint/typecheck/
52 targeted/build/strict NFT (6 traces/1569 entries) PASS. 64 браузерных сценария
390/1440 проверили UI/runtime до последующих изменений CLI, финансовой политики
и pin маршрута; реальный live UI этой сборки пока не проверен. Fresh audit
253 файлов/59 членов ZIP: совпадений с локальными ключами нет, `.env.local`0600.
Qwen закреплён за `alibaba/us-east-1`, independent SPEC/QUALITY PASS.
Закрепление не доказывает устранение 429 или отдельную квоту.

После трёх отдельных согласий пользователя применён и независимо проверен v4
журнал расходов. Затем разрешённая квалификация Qwen 12×2=24 остановилась на
ПЕРВОМ intent: HTTP 429, 1 POST, 0 повторов, стоимость неизвестна, объяснений нет.
Модель не выбрана; оригинальные сравнения 72/48 этапов также не завершены.
Новая четвёртая неизвестная стоимость снова блокирует ВСЕ платные вызовы.

## Расходы и текущий STOP

Единственный canonical ledger: основной `data/private/openrouter-budget.json`,
версия 4, 34 записи, 0600, uncertain=true/inFlight=0. Известные округлённые
фактические расходы: prep $0.001908131, включая eval $0.00168309, demo $0.
Три явно разрешённых верхних оценки: $0.264+$0.264+$0.384750001=$0.912750001,
учтены по одному разу; их actual остаётся null. Это бюджетные выделения,
а не восстановленная фактическая стоимость.

Новый unknown Qwen: `bf021306-da2b-43ca-a54e-6a7cfe23ac48`, резерв $0.26160384,
actual=null. Budget spent prep $0.914658132/eval $0.914433091, вместе с новым
резервом exposure $1.176261972/$1.176036931. Доступно после резерва prep
$0.823738028/eval $0.323963069/demo $4. Потолки $2/$1.50/$4 сохранены.
Четвёртого отдельного разрешения пока нет; guessed actual, reset/copy ledger,
повтор старых one-use operators или автоматическое снятие STOP запрещены.

В Upstream Requests найден exact `gen-1792514522-MOmoVI0e8ysvVQp9YKDB`,
20.10 21:42 Asia/Almaty, Alibaba Cloud Int., HTTP429, 1 attempt. Стоимости и
точного endpoint tag в UI нет; официальный generation GET вернул 404.
Отсутствие записи не доказывает нулевую стоимость. Региональный US endpoint
присутствует в свежих public metadata с прежними ставками, но его квота и
устранение ошибки не проверены. Новых модельных запросов после STOP не было.

## Данные, предыдущий MVP и материалы

Использован именно `data/normalized/astana/`:298мест/1953отзыва из сохранённого
2ГИС/Apify19.10.2026→app298POI/591короткаявыдержка/889provenance/7categories.
Каталог synthetic=false, цены и подтверждённыеfacts298unknown. Canonical hash
`4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6`, fileSHA
`c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`.
Сборщик/raw/normalized/collectortracker сохранены, платного recollection нет;
publication rights reviewtext не установлены. Исторический [аудит](security-audit.md).

M1/M3/M5offline приняты: responsive text path, strict filters,0–3realcatalog IDs,
profiles/localIDonly history/details/sources/maps. M5.4 исправляет UX0vsblankbudget:
явное снятие ограничения не делает POST/не меняет другие поля. Пользователь подтвердил
3карточки и оба native Maps на прежней сборке. M6voice skipped(P1). M7принят только
как offline/local handoff, не fullP0. PPTX7slides/6min и WEBM110s/VP9/noaudio приняты
и сохранены неизменными source572/buildBlw; не считать их новой AI-версией.
Код/PPTX ранее push в main разрешён пользователем; видео локальноеignored.
Постоянный hosting/YouTube/официальная отправка не выполнены.

Исторические этапы:10f4981(M1),57ce0f2(M2offline),fd37acb(M3offline),
0a6b53a(M4labels/lexical),572a813(M5offline),da659ed(M7materials),ceb34a5(M5.4),
12d5ffe(TEST+PLAN),9f78742(realindex/semanticacceptance).
Дедлайн20.10.2026 23:59, внутренняя цель20:00 Asia/Almaty.

## Восстановление публичного адреса 20.10,22:00

Новый current URL: [демо](https://donate-cooperation-quick-annual.trycloudflare.com).
Stats URL перестал разрешаться в DNS21:55; локальный origin70029/3000 не менялся.
Новый detached CF39251/PPID1 → тот же sourceceb34a5/buildNASkuokYCKTpTbx_JqKpo.
Автор:156origin GET и78public GET (включая исправленное излишнее условие приватного
probe к GET405), POST0/model0. Final:12staticassets byteequal/59privatepathsclosed/
GETAPI405; Cache-Control у GET405 отсутствует. POSTno-store не выводится из этого GET.
Root отдельно проверил current local keys только в памяти:14publicGET,
12assetsbyteequal/0совпадений/0provider; ещё1rootavailabilityGET200.
Fresh UI390/1440: по1actualstubPOST, всего2, три реальных парка,
details/literalopinions/sourcedates/mapdestinationswalk-drive/focus/overflowPASS.
Нового physicalphone/nativeapps подтверждения нет. Runtime/helper/browser evidence:
`/tmp/aituhack-mvp/public-stub-restore-20261020T1658Z/` и
`/tmp/aituhack-mvp/public-stub-browser-20261020T1700Z/`.
Независимое review текущего восстановления пока идёт. Настоящий ИИ остаётся
не выбранным/paidSTOP; это восстановление прежнего stub, не liveP0.

После независимого PASS root завершил только старый CF7982; origin70029 и новый
CF39251 сохранены. Reviewer выполнил19freshGET, проверил12assetsbyteequal,
18runtimechecksums/8UIchecksums/4screenshots/дваactualstubPOST/sourceguard/3offlineguards.
CurrentURL physicalphone не проверен; fullP0/живые ответы модели не заявлены.
