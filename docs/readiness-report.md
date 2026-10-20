# Готовность emergency-версии

## Текущий emergency checkpoint: 20.10, 23:16 Asia/Almaty

[Публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com) переключено на **live**: Mistral Small3.2 через точный `deepinfra/fp8`, OpenRouter embeddings `openai/text-embedding-3-small`, реальный индекс298×1536. Source UI `fe4c0ef8d04d35fe6d8b717b62dbf4f02915c968`, build `P3aScnSHAtsKMfuzUrbrK`; публичный HTTPS200,9assets равны сборке,7privatepaths404,known-key findings0. Cutover GET-проверка не делала новых paid QA POST.

Приняты **два** фактических private smoke:390px freeform «Найдите парк для часовой прогулки» →2места (Ботанический сад и Президенттік саябақ);1440px обязательные розетки →0мест без ослабления требования. Backend `0f47fa90eab93bada3e51ebfd8ae156c14e8612c`; UI-only fe4 добавляет явную пометку «По отзывам (мнения пользователей):». Human source/why/activity review PASS после этой правки; raw тексты и evidence не менялись. Root:1051unit +4новых render tests, build/NFT/keyscan PASS. Полная приёмка12/72/48 и старые Qwen24 **не завершены**, winner исходного сравнения не объявлен.

Четыре known provider calls (intent/query_embedding/explanation/intent) использовали prep и стоили $0.0002702. Снимок после двух private QA, до публичного пользовательского трафика: canonical v6: 39 записей — 34 known и 5 upper-bound allocations с actual=null. Известный actual prep $0.002178331, включая eval $0.00168309; бюджетные оценки $1.435957681 считаются отдельно от actual. Budget spent prep $1.438136012/eval $1.437640771; доступно prep $0.561863988/eval $0.062359229/demo $4. Резервов и in-flight нет, uncertain=false, права0600, caps $2/$1.50/$4 неизменны. Следующий unknown/overshoot/ошибка durable ledger снова останавливает платные вызовы.

Последнее прямое указание пользователя «подключи настоящий ИИ, пару тестов…» записано интегратором как emergency scope: reviewed v6 применил ровно существующий fifth target по $0.26160384, actual=null. Пользователь не повторял сумму буквально; интерпретация и исходный текст сохранены в authorization receipt, финансовые source/operator/actual independently reviewed. Это не разрешение будущих unknown или полного нового eval.

Доказательства: private пакет `/tmp/aituhack-mvp/emergency-live-release-20261020/` (public-cutover-proof, оба receipts, both-smokes-audit, human opinion-fix-review); v6 `/tmp/aituhack-mvp/fifth-upper-bound-emergency-20261020/actual-review.md`. Текущий URL физическим телефоном не подтверждён. Голос, постоянный hosting, YouTube и официальная отправка не выполнены. Ссылка зависит от Mac/сети/origin/tunnel; origin56483/demo и CF39251.

## Что можно показать сейчас

Введите «Найдите парк для часовой прогулки», выберите EXPO/5км/60мин/пустой бюджет. В принятом прогоне получены2парка; API допускает0–3, три карточки не гарантируются. Для обязательных неизвестных розеток ожидается0, а не выдуманный факт. [Сценарий и материалы](submission/submit-now.md).

Ограниченная emergency-приёмка принята; полный12-case модельный benchmark, новый physicalphone/native-app тест, YouTube и официальная заявка остаются вне выполненной приёмки. Материалы прошлого stub относятся только к историческому снимку.

<details>
<summary>Исторический checkpoint — не текущий статус</summary>

# Готовность на 20 октября 2026

## Текущий checkpoint: 20.10, 22:47 Asia/Almaty

Полный P0 с настоящим ИИ **не принят**. [Публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com) работает в stub-режиме с настоящим каталогом; произвольный текст и ИИ-объяснения ещё не опубликованы. Реальный сохранённый RAG принят локально: 298×1536, 12/12 top3, macro Recall@5 97.22%, micro 93.75%, четыре отрицательных сценария и hard filters PASS. Это development set, не слепой бенчмарк.

Четвёртое отдельное согласие пользователя применено ровно один раз и независимо проверено. Затем разрешённый новый Qwen US12×2 прогон остановился на первом intent: HTTP429, 1 POST, 0 повторов, стоимость неизвестна. Объяснений и качественной оценки нет, winner=null; оригинальные сравнения72/48 и Qwen24 не завершены. Закрепление US endpoint не устранило отказ.

Canonical ledger v5/35 записей/0600: 30 known, четыре approved upper bounds с actual=null и новый пятый unknown `c54e0818-1757-4752-a3cc-42299566784d`. uncertain=true, inFlight=0. Известный округлённый prep $0.001908131, включая eval $0.00168309; четыре бюджетные оценки $1.174353841 учтены по одному разу, они не являются восстановленной фактической стоимостью. Новый резерв $0.26160384; exposure prep $1.437865812/eval $1.437640771; доступно prep $0.562134188/eval $0.062359229/demo $4. Потолки $2/$1.50/$4 сохранены. Пятого согласия нет, все платные вызовы STOP. API принял ключ; отдельного лимита ключа не задано, кредит есть. Exact generation GET для `gen-1792517117-9rLmsCooRUs1A7VCZ6VY` вернул404; это не доказательство нулевой стоимости.

Последняя принятая offline сборка: source `9503af2b353d66cec6ea82d9d0e77656f15f2b5f`, BUILD_ID `4YqxpEYHmL2S8AGyUVa0R`. Автор1002unit, независимый reviewer38 Mistral/Qwen tests и21 frozen-input/plan checks, root lint/typecheck/build/strict NFT6traces1569entries/semantic12+4 PASS. Fresh known-key scan254files59ZIP/findings0, `.env.local`0600. Mistral/DeepInfra адаптер и отдельный план приняты только offline; defaults и приёмочный протокол не изменены, live-модель не выбрана. Подробности финансовой v5-политики отдельно проверены на f864.

Приоритет пользователя — сдача работающей версии сейчас. Нового финансового согласия не получено, платные попытки не продолжаем. Остаточный блокер M4.3: подготовлен ровно один альтернативный маршрут Mistral Small3.2/DeepInfra. Public metadata дают консервативный полный резерв $0.028096; metadata и offline adapter/tests прошли независимое ревью. Кандидат не выбран, финансового разрешения или разрешения нового приёмочного прогона нет. Повторы старых one-use операторов, guessedactual, reset/copy ledger, увеличение caps и расход demo на разработку запрещены.

Все принятые source/docs и новая презентация опубликованы в main: remote `e5b89ada0763f20f53196ce9ca7637f426dbf563` проверен20.10 22:51 Asia/Almaty,46commits, включая5новых после49fc. Следующий commit — только квитанция этой проверки; он тоже публикуется обычным push. Рабочий публичный сайт остаётся прежним stub. Root единственный writer tracker; исполнение и независимый review разными субагентами обязательны.

## Что требуется до полного P0

- Разрешить новый финансовый STOP проверяемой фактической стоимостью или отдельным решением пользователя, не расходуя demo $4.
- Завершить независимый review альтернативного адаптера и получить решение о новой all12×2 приёмке. Один полный резерв кандидата помещается в eval; 24 худших резерва суммарно не помещаются. В каждом шаге guard должен проверять остаток и останавливать прогон до превышения потолков.
- Получить и проверить все24 ответа: IDs/evidence/hard filters100%,0 неподтверждённых фактов, минимум10/12 релевантных positive,4negative guards. Транспортные отказы не являются семантическим провалом12/12.
- Пройти private/public prep end-to-end, мобильный экран и телефон на новой live-сборке; затем переключить purpose на demo.

Использован пользовательский `data/normalized/astana/`:298мест/1953отзыва из сохранённого2ГИС/Apify19.10 → app298POI/591короткая выдержка. Цены/amenities остаются неизвестными; сборщик и raw/normalized сохранены. Публикационные права текстов источника не установлены.

Текущий donate URL прошёл actual browser390/1440: два stub POST, три реальных парка, подробности/источники/карты/focus/overflow PASS. Независимое review PASS. Физическим телефоном текущий URL не проверен; пользователь подтвердил прежние URL той же stub-сборки и обе нативные карты. Ссылка зависит от Mac/сети/сервера/туннеля.

Голос skipped P1. Исторические PPTX7слайдов/6min notes и WEBM110s/source572/buildBlw сохранены; они не показывают новую AI-версию. Постоянный hosting, YouTube и официальная отправка не выполнены. Внутренняя цель20:00 пропущена, deadline23:59 Asia/Almaty. [Материалы и запуск](submission/links.md), [manifest](submission/release-manifest.json), [ограничения](submission/limitations.md).

</details>
