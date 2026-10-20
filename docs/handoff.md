# Продолжение MVP

> 20.10 22:00 Asia/Almaty: после DNS-отказа stats hostname новый публичный
> [адрес демо](https://donate-cooperation-quick-annual.trycloudflare.com) отвечает HTTPS200.
> Fresh390/1440: два настоящих stub POST и три карточки; independent SPEC/QUALITY review PASS.

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

## Продолжение и сохранённая работа

План и реализация разрешены; без повторного брейншторма. Начинать с `next_task_id`
в [tracker.yaml](../tracker.yaml), сейчас M4.3. Root — единственный writer трекера;
исполнитель и другой reviewer обязательны. После каждой принятой подзадачи сразу
обновлять status/evidence/next. Node 24.21.0/pnpm 11.0.8.

Managed worktree: `/Users/macbook/.codex/worktrees/live-p0/aituhack`,
branch `codex/live-p0`. Принятый bd8e3da интегрирован обычным merge33ba8c6 в main;
3410a4a также интегрирован обычным merge в main. Предыдущее разрешение push main сохраняется.
Private receipts/reviews: `/tmp/aituhack-mvp/`; не повторять one-use operators.

Следующий разрешённый шаг — завершить offline review браузерного driver и документации.
Дальнейшие paid calls требуют фактической аудируемой сверки нового списания или
нового явного решения пользователя. Затем новый reviewed Qwen24 прогон,
независимый review каждого intent/why/activity, выбор модели, private paid smoke,
public prep QA и телефон. Только после приёмки переключать purpose на demo.
Критерии: 100% допустимых IDs/evidence/hard filters, 0 неподтверждённых фактов,
минимум 10/12 релевантных validated positive, четыре negative guards; не ослаблять.

Публичный fallback: source ceb34a5/build NASkuokYCKTpTbx_JqKpo, origin PID70029
на 3000, новый CF PID39251 (предыдущий7982 завершён послеreview). Не пересобирать его `.next` и не останавливать до принятия
нового адреса. Fresh 390/1440: два actual stub POST → три реальных парка,
details/sources/maps/focus/overflow PASS. Текущий URL ещё не проверен физическим
телефоном. Пользователь подтвердил три карточки на предыдущем loan URL,
а обе нативные карты — на более раннем percentage URL той же stub-сборки.
Ссылка зависит от включённых Mac/сервера/туннеля/сети, постоянного hosting нет.

Использован именно `data/normalized/astana/`: 298 мест/1953 отзыва из сохранённого
сбора 2ГИС через Apify 19.10 → app 298 POI/591 короткая выдержка/889 provenance,
7 категорий. Dataset hash 4677a7a004ef, catalog file SHA
`c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`.
Все цены и подтверждённые amenities остаются неизвестными. Повторного сбора нет;
права публикации текстов источника не установлены. Сборщик/raw/normalized и его
tracker section сохранены. Не auto-add шесть untracked collector paths, не коммитить
ключи, raw, ledger, index/cache или WEBM. PPTX/WEBM сохраняют исторический
source572/buildBlw, не считать их новой AI-версией. Голос M6 skipped P1,
YouTube/постоянный hosting/официальная отправка не выполнены.

Внутренняя цель 20:00 пропущена. Крайний срок: 20.10.2026 23:59 Asia/Almaty.

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
