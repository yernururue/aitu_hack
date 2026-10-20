# Продолжение MVP

## Текущий emergency checkpoint: 20.10, 23:16 Asia/Almaty

[Публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com) переключено на **live**: Mistral Small3.2 через точный `deepinfra/fp8`, OpenRouter embeddings `openai/text-embedding-3-small`, реальный индекс298×1536. Source UI `fe4c0ef8d04d35fe6d8b717b62dbf4f02915c968`, build `P3aScnSHAtsKMfuzUrbrK`; публичный HTTPS200,9assets равны сборке,7privatepaths404,known-key findings0. Cutover GET-проверка не делала новых paid QA POST.

Приняты **два** фактических private smoke:390px freeform «Найдите парк для часовой прогулки» →2места (Ботанический сад и Президенттік саябақ);1440px обязательные розетки →0мест без ослабления требования. Backend `0f47fa90eab93bada3e51ebfd8ae156c14e8612c`; UI-only fe4 добавляет явную пометку «По отзывам (мнения пользователей):». Human source/why/activity review PASS после этой правки; raw тексты и evidence не менялись. Root:1051unit +4новых render tests, build/NFT/keyscan PASS. Полная приёмка12/72/48 и старые Qwen24 **не завершены**, winner исходного сравнения не объявлен.

Четыре known provider calls (intent/query_embedding/explanation/intent) использовали prep и стоили $0.0002702. Снимок после двух private QA, до публичного пользовательского трафика: canonical v6: 39 записей — 34 known и 5 upper-bound allocations с actual=null. Известный actual prep $0.002178331, включая eval $0.00168309; бюджетные оценки $1.435957681 считаются отдельно от actual. Budget spent prep $1.438136012/eval $1.437640771; доступно prep $0.561863988/eval $0.062359229/demo $4. Резервов и in-flight нет, uncertain=false, права0600, caps $2/$1.50/$4 неизменны. Следующий unknown/overshoot/ошибка durable ledger снова останавливает платные вызовы.

Последнее прямое указание пользователя «подключи настоящий ИИ, пару тестов…» записано интегратором как emergency scope: reviewed v6 применил ровно существующий fifth target по $0.26160384, actual=null. Пользователь не повторял сумму буквально; интерпретация и исходный текст сохранены в authorization receipt, финансовые source/operator/actual independently reviewed. Это не разрешение будущих unknown или полного нового eval.

Доказательства: private пакет `/tmp/aituhack-mvp/emergency-live-release-20261020/` (public-cutover-proof, оба receipts, both-smokes-audit, human opinion-fix-review); v6 `/tmp/aituhack-mvp/fifth-upper-bound-emergency-20261020/actual-review.md`. Текущий URL физическим телефоном не подтверждён. Голос, постоянный hosting, YouTube и официальная отправка не выполнены. Ссылка зависит от Mac/сети/origin/tunnel; origin56483/demo и CF39251.

## Следующий шаг

Source, README, MP4, два скриншота, новый live-PPTX и текущие документы опубликованы в main `912ee9de2fe38093ce22ad594543ca4eb59a28c5`, remote проверен23:21 Asia/Almaty. M5.5/M7.10 завершены; следующий незавершённый gate — M4.3 (полная квалификация модели). Root сверяет [tracker](../tracker.yaml). Не повторять one-use policy/smoke operators, не создавать другой ledger, не тратить demo на разработку. Public purpose=demo; development smoke были prep. Полный модельный eval требует отдельного решения и остатка бюджета. Повторять платные QA ради UI-подписи не нужно.

Сохранить исходный collector/raw/normalized и шесть untracked originals. Каталог298/591/7, source298/1953, catalogc72d13… и index568c855… неизменны. Исторические PPTX/WEBM не перезаписывать; MP4 — копия старой stub-записи, новый live-PPTX — отдельный файл. Трекер пишет только root; README/source/assets принадлежат другим исполнителям.

[Текущие ссылки](submission/links.md) · [Пакет для формы](submission/submit-now.md) · [Бюджет](budget.md) · [Ограничения](submission/limitations.md)

<details>
<summary>Исторический checkpoint — не текущий статус</summary>

# Продолжение MVP

## Текущий checkpoint: 20.10, 22:47 Asia/Almaty

Полный P0 с настоящим ИИ **не принят**. [Публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com) работает в stub-режиме с настоящим каталогом; произвольный текст и ИИ-объяснения ещё не опубликованы. Реальный сохранённый RAG принят локально: 298×1536, 12/12 top3, macro Recall@5 97.22%, micro 93.75%, четыре отрицательных сценария и hard filters PASS. Это development set, не слепой бенчмарк.

Четвёртое отдельное согласие пользователя применено ровно один раз и независимо проверено. Затем разрешённый новый Qwen US12×2 прогон остановился на первом intent: HTTP429, 1 POST, 0 повторов, стоимость неизвестна. Объяснений и качественной оценки нет, winner=null; оригинальные сравнения72/48 и Qwen24 не завершены. Закрепление US endpoint не устранило отказ.

Canonical ledger v5/35 записей/0600: 30 known, четыре approved upper bounds с actual=null и новый пятый unknown `c54e0818-1757-4752-a3cc-42299566784d`. uncertain=true, inFlight=0. Известный округлённый prep $0.001908131, включая eval $0.00168309; четыре бюджетные оценки $1.174353841 учтены по одному разу, они не являются восстановленной фактической стоимостью. Новый резерв $0.26160384; exposure prep $1.437865812/eval $1.437640771; доступно prep $0.562134188/eval $0.062359229/demo $4. Потолки $2/$1.50/$4 сохранены. Пятого согласия нет, все платные вызовы STOP. API принял ключ; отдельного лимита ключа не задано, кредит есть. Exact generation GET для `gen-1792517117-9rLmsCooRUs1A7VCZ6VY` вернул404; это не доказательство нулевой стоимости.

Последняя принятая offline сборка: source `9503af2b353d66cec6ea82d9d0e77656f15f2b5f`, BUILD_ID `4YqxpEYHmL2S8AGyUVa0R`. Автор1002unit, независимый reviewer38 Mistral/Qwen tests и21 frozen-input/plan checks, root lint/typecheck/build/strict NFT6traces1569entries/semantic12+4 PASS. Fresh known-key scan254files59ZIP/findings0, `.env.local`0600. Mistral/DeepInfra адаптер и отдельный план приняты только offline; defaults и приёмочный протокол не изменены, live-модель не выбрана. Подробности финансовой v5-политики отдельно проверены на f864.

Приоритет пользователя — сдача работающей версии сейчас. Нового финансового согласия не получено, платные попытки не продолжаем. Остаточный блокер M4.3: подготовлен ровно один альтернативный маршрут Mistral Small3.2/DeepInfra. Public metadata дают консервативный полный резерв $0.028096; metadata и offline adapter/tests прошли независимое ревью. Кандидат не выбран, финансового разрешения или разрешения нового приёмочного прогона нет. Повторы старых one-use операторов, guessedactual, reset/copy ledger, увеличение caps и расход demo на разработку запрещены.

Все принятые source/docs и новая презентация опубликованы в main: remote `e5b89ada0763f20f53196ce9ca7637f426dbf563` проверен20.10 22:51 Asia/Almaty,46commits, включая5новых после49fc. Следующий commit — только квитанция этой проверки; он тоже публикуется обычным push. Рабочий публичный сайт остаётся прежним stub. Root единственный writer tracker; исполнение и независимый review разными субагентами обязательны.

## Как продолжать

Читать [tracker](../tracker.yaml), этот handoff, [progress](progress.md) и нужный этап [implementation-plan](implementation-plan.md). `next_task_id=M4.3`; план утверждён, повторный брейншторм не нужен. Для разработки использовать существующий managed worktree `/Users/macbook/.codex/worktrees/live-p0/aituhack`, branch `codex/live-p0`, Node24.21.0/pnpm11.0.8. Трекер пишет только root и обновляет сразу после каждой принятой подзадачи. Контракт/API без необходимости не менять.

Источники latest failure и независимого аудита: `/tmp/aituhack-mvp/live-qwen-us-qualification-20261020/`. Ledger SHA `7dc5e31e8c8c04d15603c0757b53c58643876e0427f101c1328a10d9b818f595`; reviewer восстановил в памяти exact предыдущий v5 SHA38c0…6b25, все прошлые записи и четыре grant сохранены. Четвёртый одноразовый оператор `/tmp/aituhack-mvp/fourth-upper-bound-policy-20261020/` уже выполнен17:17:55UTC: никогда не повторять `--execute`. Отдельное последующее audit-clear тоже уже выполнено, новый STOP относится к новой попытке.

Подготовка одного альтернативного маршрута — `/tmp/aituhack-mvp/fallback-candidate-20261020/`. После source/metadata review нужен конкретный запрос пользователя о пятом бюджетном выделении и новой приёмке, если фактическую стоимость не удастся подтвердить. До решения allpaidSTOP. После разрешения: отдельная reviewed финансовая политика и audited application, новый reviewed all12intent+explanation прогон, независимая проверка каждого intent/why/activity по источникам. Критерии не ослаблять:100% IDs/evidence/hard filters,0 неподтверждённых фактов, минимум10/12 relevant positive,4negative guards. Только затем private/public prep end-to-end, телефон и переход в demo purpose. Наличие adapter/build не заменяет эти проверки.

## Публичное демо и сохранённые данные

Current [URL](https://donate-cooperation-quick-annual.trycloudflare.com): origin70029/port3000 sourceceb34a5/buildNASkuokYCKTpTbx_JqKpo, tunnel39251. Не пересобирать основной `.next` и не останавливать процессы до приёмки замены. Fresh browser390/1440: два actual stub POST, три парка, details/literalopinions/sources/maps/focus/overflow PASS. Независимое review восстановления PASS;12assets byteequal/59privatepathsclosed, knownkeys0. Текущий URL физическим телефоном не подтверждён; прежние loan/percentage URL пользователь проверил, включая обе нативные карты. Ссылка зависит от работающих Mac, сети, origin и tunnel; постоянного hosting нет.

Использован именно `data/normalized/astana/`: сохранённый сбор 2ГИС через Apify19.10.2026,298мест/1953отзыва → app298POI/591короткая выдержка/889provenance/7категорий. Dataset4677a7a004ef, catalogSHA `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`, indexSHA `568c855ff30dc866c8de4f0eed3038df4406898bd45fe25472f5afa318934d45`. Все цены и подтверждённые amenities неизвестны, ограничения не ослаблять. Повторного сбора или reindex не нужно; права публикации текстов источника не установлены.

Сохранить collector raw/normalized/section и шесть untracked originals: `data/README.md`, `data/collection/`, `scripts/astana_data.py`, `scripts/collect_astana.py`, `scripts/test_astana_data.py`, `scripts/test_collect_astana.py`. Не auto-add их, ключи, ledger, raw, index/cache или WEBM. PPTX/WEBM остаются историческим source572/buildBlw, не новой AI-версией; не перезаписывать. Голос M6 skipped P1; YouTube, постоянный hosting и официальная отправка не выполнены. Внутренняя цель20:00 пропущена; deadline20.10.2026 23:59 Asia/Almaty.

</details>
