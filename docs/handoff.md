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

M2.4 настоящий индекс и M4.3–M4.4 сравнение/выбор модели blocked.
M5.4: уточнение нулевого бюджета и явное снятие только этого ограничения.
Пользователь подтвердил сайт и 3 карточки на физическом телефоне после снятия бюджета0.
Обе кнопки 2ГИС/Google Maps открыли выбранный Ботанический сад в приложениях.
M5.3 blocked только на реальном paid live smoke.
M6 голос skipped: P1 gate не выполнен, UI/endpoint записи отсутствуют.
Продолжение независимых offline/release задач разрешено пользователем со stubs;
waivers записаны явно и не превращают внешние gates в done. Следующий шаг брать
из tracker, а не из исторического текста этапа.

OpenRouter $0 записанных платных вызовов, баланс аккаунта не проверен;
$2prep incl$0.50eval/$4demo reserve. Ключ в `.env.local` присутствует, auth401.
Пользователь подтвердил, что ключ ещё не обновлён: **не повторять auth/paid calls**,
не выводить секреты и не просить ключ в чате. `APP_AI_MODE=stub` выбирается явно;
без него disabled работает по категориям. Только пять точных демо-фраз,
неизвестный текст уточняется без карточек. Actual model=null; Luna provisional.
Guard проверен, paid defaultoff; для paid нужны действующий ключ, явная настройка
и долговечный ledger. Serverless paid запрещён; Haiku reserve1.32>$0.50 eval cap.

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
Actual temporary URL: https://percentage-slim-contemporary-appropriate.trycloudflare.com .
Предыдущий URL converter-mirrors-commercial-gem retired после завершения tool sessions.
После M5.4 origin70029 и прежний tunnel64556 detached/PPID1/ownPGIDs, остаются зависимыми от Mac/сети.
Текущий launcher/log/probe: `/tmp/aituhack-mvp/release-runtime-M5.4-20261020T001928Z/`;
прежний tunnel/log пакет: `/tmp/aituhack-mvp/release-runtime-restart-20261019T235726Z/`.
Текущее приложение: source`ceb34a5`, build`NASkuokYCKTpTbx_JqKpo`.
PPTX/видео неизменны: source572a813/buildBlwNsPwtVQoToEIUwspvC.
PPTX7slides/6min и video110s приняты независимым reviewer и сохранены неизменными.
Новая UI-сборка M5.4 отдельно прошла перечисленные выше проверки.
Видео/privatebuild ignoredGit и доступны локально, не считать их публично загруженными.
M7.5: доступ с телефона, 3 карточки и оба native-перехода к выбранному месту
подтверждены пользователем. M5.3 realpaid smoke остаётся непроверенным.
Пока пользователь не подтвердит обновление ключа, не выполнять auth/paid retry.

Локальная передача/материалы сохранены stage commit`da659ed52fd276ae3787f46a266d3730b96a42b2`;
Проверки сайта, карточек и обеих карт на физическом телефоне подтверждены пользователем;
итоговый статус M7.5/M7 — в tracker.yaml. По прямому запросу пользователя история
отправлена в `main` [GitHub](https://github.com/yernururue/aitu_hack) обычным push.
YouTube/официальная отправка заявки не выполнялись.
`next_task_id=M2.4`: первый внешний P0 gate — реальный индекс, но key/auth нельзя
повторять, пока пользователь не подтвердит обновление. Остальные доступные offline
задачи выполнены. $0 OpenRouter, $2prep/$0.50nested/$4demo reserve без изменений.
