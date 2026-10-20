# Состояние проекта

Stage: implementation

Дата: 20.10.2026, Asia/Almaty. План утверждён; повторное согласование не требуется.
Статусы и следующий шаг — [tracker.yaml](../tracker.yaml). Полная история task evidence
сохранена в трекере; этот файл — короткая передача текущего состояния.

## Выполнение MVP

M2.6 done: новый серверный ключ authHTTP200. Реальная кампания3POST: embedding endpoint200
($0.00000018/9tokens) остановлен на native-model alias mismatch до1536 validation;
отдельные intent/explanation GPT‑6 Luna/OpenAI HTTP200, strict schema/evidence PASS
($0.0001065+$0.0001382). Root сверил3settled entries с каноническим ledger0600:
всего$0.00024488, unknown/inFlight/reserved0; остатки prep$1.99975512/eval$0.49975512/demo$4.
Fresh62budget tests PASS; новый key-specific scan131files/59ZIP/findings0,
финальный private-artifact scan46files/ledger0matches. Нет source/build/publicmode changes.
[Уточнённый план](live-p0-plan.md): alias RED/fix/review → cached298index/semantic eval
→ bounded quotes/full3model comparison → private live path → production cutover.
Полный P0=false; публичный сайт пока stub, winner не выбран.
Независимый итоговый SPEC/QUALITY review PASS для TEST+PLAN; diagnostic campaign3POST
завершена, следующие реальные действия — по M2.4/плану и тому же ledger.

M7.8 done: публичный адрес восстановлен заменой только туннеля:
[открыть демо](https://loan-begins-sleeps-unavailable.trycloudflare.com).
20.10 около14:12 Asia/Almaty новыйHTTPS200,12clientassets byteequal/private55closed/GET405.
Свежие8publicPOST без mocks: мобильный390 полный проверенный набор,
настольный1440 базовый поиск;3realparks/hash4677, strict0/явнаяочисткабезPOST/null3,
детали/источники/обе карты2режима/профиль/save/dismiss/reset/unknownclarify0PASS.
Интегратор просмотрел текущие скриншоты. Origin70029/buildNASku/sourceceb сохранены,
новый detachedtunnel80285; старый64556 остановлен после проверки замены.
Пользователь подтвердил новыйURL на телефоне: «Открылся, три карточки есть».
Повторный native-переход не сообщался; прежнее подтверждение обеих карт
относится к той же сборке на прежнем адресе. Устройство и браузер не указаны.
[Отчёт о готовности](readiness-report.md): текстовое stub-демо работает,
полная P0 RAG остаётся незавершённой. Восстановление M7.8 не делало платных/auth/provider-вызовов. Независимый SPEC/QUALITY review PASS в рамках
offline/stub; root harness/diff/94local links/manifest+неизменные hashes PASS.

M7.7 ранее повторно подтвердил `data/normalized/astana/`:298мест/1953отзыва→591выдержка;
приватный replay каталога/report byteEXACT. Local/Git/origin secret scan:
known0/high0/unresolved0, .env.local0600. Исторический PUBLICDNSWARN относится
к прежнему URL, новый внешний адрес перепроверен в M7.8. [Аудит](security-audit.md).


После локальной передачи пользователь открыл сайт на физическом телефоне, но получил
0мест при явно заданном бюджете0₸. Это корректный строгий фильтр: все298цен неизвестны.
Тот же запрос EXPO/5км/«Хочу погулять» с пустым бюджетом даёт3реальныхпарка.
M5.4: добавлены объяснение0vsпустое поле, подсказка у пустого результата, переход
к бюджету и явная кнопка его снятия. Она сохраняет остальные условия и не запускает
поиск автоматически. Независимый SPEC/QUALITY review PASS. Root fresh public smoke
390/1440 подтвердил0→0/явнаяочисткабезPOST/повторныйпоиск→3, все остальные поля совпали.
Текущий source`ceb34a5`, build`NASkuokYCKTpTbx_JqKpo`, origin70029/tunnel80285 после восстановления M7.8.
PPTX/видео M7.1–M7.4 сохранены как снимок source572/buildBlw/554unit/62e2e.
Финальный независимый integration/docs review SPEC/CONSISTENCY+QUALITY PASS;
tracker/manifest/current build и неизменённые материалы согласованы.
Пользователь подтвердил на физическом телефоне 3 из 3 карточки после снятия бюджета:
Ботанический сад, Samal Park, Ғашықтар; EXPO/5км/60мин/solo/без профиля,
версия данных `4677a7a004ef`. Пользователь также подтвердил: 2ГИС и Google Maps
открыли выбранный Ботанический сад в приложениях. Live/semantic gates blocked.

Проверенный offline/stub текстовый путь работает на 298 реальных POI: фильтры,
лексическое ранжирование, серверный API, адаптивный UI, подробности/источники,
демо-профили, локальные сохранения/скрытия/сброс, 2ГИС и Google Maps walking/driving.
Новые браузеры не получают профиль автоматически; текущие условия важнее истории.
История хранит только профиль и ID, без запросов/координат/аудио.

M1/M3 приняты, M2 offline code принят; M4.1/M4.2 numerical gate принят;
M5.1/M5.2 приняты после независимого review. Последний UI P2 исправлен:
HTTP provenance остаётся точным текстом, HTTPS — кликабельной ссылкой; RED2anchors →
GREEN2viewport cases, независимый probe/re-review PASS. Голос M6 skipped по P1 gate,
записи/транскрипции нет. M7 принят в рамках offline/local передачи по явному waiver;
полная P0 RAG-приёмка остаётся незавершённой.
По прямому запросу пользователя вся история отправлена обычным push в `main`
[GitHub-репозитория](https://github.com/yernururue/aitu_hack). Исторический первый push включал11коммитов; затем опубликованы служебная запись
и аудит датасета/ключей. Код/PPTX доступны в GitHub,
видео остаётся локальным. YouTube и официальная отправка заявки не выполнялись.

## Последние проверки интегратора

Все команды под Node24.21.0/pnpm11.0.8; платные режимы явно выключены.

| Команда | Результат |
|---|---|
| `python3 scripts/check_harness.py` | exit0, документы/fixtures/ссылки |
| `pnpm lint` | exit0, в том числе повтор после финальных материалов, без предупреждений |
| `pnpm typecheck` | exit0, Next typegen + strict TS |
| `pnpm test` | exit0, 554 теста /16 файлов после финального UI fix |
| `APP_AI_MODE=stub OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false pnpm build` | exit0, production |
| `pnpm check:build-artifacts` | exit0, 6 NFT traces/1568 entries; каталог включён, raw/private/env/collector tooling исключены |
| `pnpm test:e2e` | exit0, 64/64 за30.7s, 390/1440 Chromium после M5.4 |
| `pnpm eval:retrieval` | exit1 ожидаемо: numericalPASS, semanticVerified=false/acceptancePassed=false |
| `LIVE_EVAL_ENABLED=false pnpm eval:live` | exit0, disabled, 0rows/0network/0cost |
| `git diff --check` | exit0 |

Browser покрывает настоящий локальный API/каталог: 0–3 валидных ID, snapshot,
источники, строгие unknown budget/facts, unknown query/conflicts, loading/errors,
профили/history/reset/persistence failures, race/abort, denied/late geolocation,
focus trap/restoration/Close и отсутствие горизонтального скролла. Scoped mocks
используются только для гонок/отказов и явно synthetic literal-HTML review fixture.
Root просмотрел реальные desktop/mobile скриншоты карточек и подробностей.
Native-переходы 2ГИС и Google Maps на физическом телефоне отдельно подтверждены пользователем.

## Данные и качество

Каталог synthetic=false:298 POI,591 короткая буквальная выдержка отзывов,
889 provenance records,7категорий. Проверенный срез36:3зоны/3категории.
Сбор19.10.2026 18:24:24–18:35:43UTC; normalized snapshot18:41:06.854110UTC.
File SHA256 `c72d13a1d8df327edc22adce02743b0246aec157e86330c96c408bc44fabb873`;
canonical runtime snapshot `4677a7a004ef0626f4b911814a8f3b825f81e61ab8b03f82cb00d977fe6950a6`.
Все298 price/facts неизвестны. Оригинальный collector/package/снимки сохранены;
raw и пользовательские данные не коммитились. Права публикации review text не установлены.

Frozen12RU positives:top3=12/12, macroRecall5=.9722222222, micro=.9375;
4negative отдельно4/4, hardPASS. Macro denominator ровно12, не16.
Это agent-curated development labels, не независимый blind benchmark.
RAGOps supplemental сравнение baseline.8833333333→.9722222222 (+8.89pp) PASS;
semantic/citation/live качество этим не подтверждается. Дополнительные4KK отдельно:
4/4top3/.9166666667; native-speaker/liveKK не проверены. См. [решение по моделям](model-decision.md).
Приватные eval receipts — ignored `output/evaluation/`; модели реальным данным не вызывались.

## Внешние блокеры и расходы

M2.4: настоящий embedding index отсутствует. M4.3/M4.4: live comparison/выбор модели
не выполнены; actual production model=null, Luna provisional. Ключ обновлён, auth200
и два chat diagnostics прошли. M2.4 теперь blocked на native-model alias comparison,
не на прежнем401; полный индекс и live UI smoke ещё не выполнены.
Haiku conservative reserve$1.32>$0.50 eval cap; лимиты не повышены.
M5.3 blocked только на одном реальном paid live smoke, который не выполнен.
Это не полная P0 RAG acceptance. Vercel session preflight403, нового login не было;
временный QuickTunnel восстановлен и повторно проверен: [адрес/запуск](submission/links.md).
Это process-bound preview, не стабильный hosting. Root fresh private contexts390/1440
подтвердили реальный API/hash/3parks/детали/routes/unknowntext, overflow/errors0.
12private404/GET405/POSTno-store/400/429 и canarylogs проверены снаружи/локально.
После M5.4 повторены strictschema/0vsnull/400/isolated429/private404/GET405 и3private0600
canarylogs; runtime report PASS, процессы живы в00:21:18UTC. Публичный browser390/1440 PASS.

OpenRouter учтённый расход проекта$0.00024488; баланс аккаунта не проверен.
Persistent guard (concurrency/reservation/usage/crash/failure) проверен независимо;
публичный paid выключен, реальный единый ledger инициализирован0600 и содержит3settled entries. $2prep включает$0.50eval,
$4demo reserve сохранён; serverless paid запрещён. Apify — отдельный ранее
разрешённый сбор, его бюджет/collector tracker не изменялись.

## Сохранённые этапы

`10f4981` M1; `57ce0f2` M2 offline; `fd37acb` M3 offline;
`0a6b53a` M4 labels/lexical. M5 offline feature snapshot — `572a813`; M7 материалы/демо — `da659ed`;
M5.4 бюджет/recovery — `ceb34a5`.
Дедлайн20.10.2026 23:59, внутренняя цель20:00 Asia/Almaty.
