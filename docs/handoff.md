# Продолжение MVP

План утверждён. Продолжать с `next_task_id` в [tracker.yaml](../tracker.yaml),
сначала сверить in_progress reports; не повторять брейншторм и исследования.
[progress.md](progress.md) содержит текущие проверки и ограничения.

Рабочая папка `/Users/macbook/Yernur/projects/aituhack`, ветка `main`; локальная `codex/p0-mvp` сохранена.
Runtime Node24.21.0/pnpm11.0.8. Исполнители/review и briefs: `/tmp/aituhack-mvp/`;
root — единственный writer tracker. Всегда implementer и другой независимый reviewer,
непересекающиеся owned files; после каждой принятой подзадачи сразу status/evidence/next.

Принято: M1 scaffold/контракты/импорт 298 реальных POI; M2 offline filters/ranking,
индексатор/кеш и persistent single-host spend guard; M3 API и полный текстовый UI;
M4.1–M4.2 source-first labels и numerical lexical gate; M5.1–M5.2 профили, локальные
ID-only preferences, подробности/источники и HTTPS walking/driving ссылки обеих карт.
Root current lint/types/554unit/build/NFT/64e2e PASS, независимые task reviews PASS.
RU12/12top3, macroRecall5 97.22%, negative4/4/hardPASS; KK отдельно4/4/91.67%.
Это agent-curated dev set и lexical, не blind benchmark и не semantic/live acceptance.
`eval:retrieval` exit1: semanticVerified=false/acceptancePassed=false при numericalPASS.

M2.4 настоящий индекс blocked на native-model alias validation; M4.3–M4.4
сравнение/выбор модели blocked на безопасном reserve и дальнейшей приёмке.
M2.6 done: обновлённый ключ auth200,3paid diagnostics/$0.00024488, два chat schema/evidencePASS.
Embedding HTTP200 остановлен до1536 validation: text-embedding-3-small != openai/text-embedding-3-small.
[Новый конкретный план](live-p0-plan.md); не повторять one-use diagnostics/не создавать новый ledger.
M5.4: уточнение нулевого бюджета и явное снятие только этого ограничения.
Пользователь подтвердил сайт и 3 карточки на физическом телефоне после снятия бюджета0.
Обе кнопки 2ГИС/Google Maps открыли выбранный Ботанический сад в приложениях.
M5.3 blocked только на реальном paid live smoke.
M6 голос skipped: P1 gate не выполнен, UI/endpoint записи отсутствуют.
Продолжение независимых offline/release задач разрешено пользователем со stubs;
waivers записаны явно и не превращают внешние gates в done. Следующий шаг брать
из tracker, а не из исторического текста этапа.

OpenRouter: $0.00024488 записанных расходов, баланс аккаунта не проверен.
$2prep incl$0.50eval/$4demo reserve. Пользователь подтвердил обновление ключа;
auth200 и два GPT‑6 Luna chat diagnostics прошли. Ключ только в `.env.local`0600,
не выводить его/сырые provider responses. Канонический ledger уже существует:
`/Users/macbook/Yernur/projects/aituhack/data/private/openrouter-budget.json`,0600,
3settled entries, unknown/inFlight/reserved0. Остаток prep1.99975512/eval.49975512/demo4.
Никогда не менять путь/не инициализировать второй ledger ради нового лимита.
Публичные APP_AI_MODE=stub/paidfalse сохранены; actual production model=null,
Luna provisional, Haiku reserve1.32>.50. Реальные будущие вызовы — только через guard
после соответствующих gates/проверки цен. Single-host persistent, serverlesspaid запрещён.

Сборщик `scripts/astana_data.py`, `scripts/collect_astana.py` и его тесты/данные
сохранены отдельно, часть исходных файлов untracked. Не перетирать/авто-коммитить,
не повторять paid collection. App catalog — `data/catalog/places.json`, отдельный
[report/mapping](collection-import.md). Все price/facts неизвестны; ограничения
не ослаблять. Synthetic fixtures только для тестов. Права публикации review text
не установлены; raw/контакты/авторы/фото не входят в app. Не считать preview
стабильным хостингом или локальный commit официальной сдачей.

Дедлайн20.10.2026 23:59 Asia/Almaty, внутренняя цель20:00.

## Финальные локальные материалы

M7.1–M7.4 приняты: [демо/файлы/lifecycle](submission/links.md),
[manifest](submission/release-manifest.json), [сценарии](submission/scenarios.md),
[ограничения](submission/limitations.md), [презентация/заметки](submission/presentation-outline.md).
Actual temporary URL: https://loan-begins-sleeps-unavailable.trycloudflare.com .
M7.8 заменил только tunnel: origin70029 и новый tunnel80285 detached/PPID1/ownPGIDs.
Старый percentage-slim DNS недоступен, tunnel64556 остановлен после новогоHTTPS200.
НовыйURL проверен actualAPI390/1440 и пользователем на телефоне:
«Открылся, три карточки есть». Повторный native-переход этим ответом не подтверждён.
Доступ остаётся зависимым от Mac/сети, постоянного hosting нет.
Текущий launcher/log/probe: `/tmp/aituhack-mvp/release-runtime-M5.4-20261020T001928Z/`;
новый tunnel/log пакет: `/tmp/aituhack-mvp/public-restore-20261020/`.
Текущее приложение: source`ceb34a5`, build`NASkuokYCKTpTbx_JqKpo`.
PPTX/видео неизменны: source572a813/buildBlwNsPwtVQoToEIUwspvC.
PPTX7slides/6min и video110s приняты независимым reviewer и сохранены неизменными.
Новая UI-сборка M5.4 отдельно прошла перечисленные выше проверки.
Видео/privatebuild ignoredGit и доступны локально, не считать их публично загруженными.
M7.5: доступ с телефона, 3 карточки и оба native-перехода к выбранному месту
подтверждены пользователем. M5.3 realpaid smoke остаётся непроверенным.
Первый оплаченный embedding test имеет alias blocker; два отдельных chat diagnostics
не закрывают real end-to-end live smoke.

Локальная передача/материалы сохранены stage commit`da659ed52fd276ae3787f46a266d3730b96a42b2`;
Проверки сайта, карточек и обеих карт на физическом телефоне подтверждены пользователем;
итоговый статус M7.5/M7 — в tracker.yaml. По прямому запросу пользователя история
отправлена в `main` [GitHub](https://github.com/yernururue/aitu_hack) обычным push.
YouTube/официальная отправка заявки не выполнялись.
`next_task_id=M2.4`: сначала reviewed alias regression/fix,
затем реальный индекс. Ключ уже работает. Учтённый расход$0.00024488, потолки
$2prep/$0.50nested/$4demo reserve прежние.

## Повторная проверка источника и ключей

M7.7: [аудит](security-audit.md) подтверждает normalized→catalog298/591 и
byteEXACT приватный replay. Known/high/unresolved secrets0 в локальных данных,
Git и actualorigin; .env.local0600. M7.7 publicHTTP0/DNSWARN относится к прежнему URL.
M7.8 новыйURL:HTTPS200/12clientassets byteequal/private55closed/GET405,
actual8POST/mobile390+desktopbaseline1440PASS, без model/provider/auth/paid.
[Текущая готовность](readiness-report.md): offline text demo готов, полная P0 RAG нет.
При смене данных/.env/build повторить redacted scan перед отправкой провайдеру.
M2.6 повторил проверку нового ключа в131files/59ZIP без совпадений;
46final private artifacts/ledger тоже без ключей. Новые вызовы только по live-плану и guard.
