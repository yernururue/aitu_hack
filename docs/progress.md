# Состояние проекта

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
