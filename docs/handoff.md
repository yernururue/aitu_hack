# Продолжение MVP

План утверждён. Продолжать с `next_task_id` в [tracker.yaml](../tracker.yaml),
сначала сверить in_progress reports; не повторять брейншторм и исследования.
[progress.md](progress.md) содержит текущие проверки и ограничения.

Рабочая папка `/Users/macbook/Yernur/projects/aituhack`, ветка `codex/p0-mvp`.
Runtime Node24.21.0/pnpm11.0.8. Исполнители/review и briefs: `/tmp/aituhack-mvp/`;
root — единственный writer tracker. Всегда implementer и другой независимый reviewer,
непересекающиеся owned files; после каждой принятой подзадачи сразу status/evidence/next.

Принято: M1 scaffold/контракты/импорт 298 реальных POI; M2 offline filters/ranking,
индексатор/кеш и persistent single-host spend guard; M3 API и полный текстовый UI;
M4.1–M4.2 source-first labels и numerical lexical gate; M5.1–M5.2 профили, локальные
ID-only preferences, подробности/источники и HTTPS walking/driving ссылки обеих карт.
Root final lint/types/554unit/build/NFT/62e2e PASS, независимые task reviews PASS.
RU12/12top3, macroRecall5 97.22%, negative4/4/hardPASS; KK отдельно4/4/91.67%.
Это agent-curated dev set и lexical, не blind benchmark и не semantic/live acceptance.
`eval:retrieval` exit1: semanticVerified=false/acceptancePassed=false при numericalPASS.

M2.4 настоящий индекс и M4.3–M4.4 сравнение/выбор модели blocked.
M5.3 blocked на физическом телефоне/native maps и реальном paid smoke.
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
Новый origin64525 и tunnel64556 detached/PPID1/ownPGIDs, остаются зависимыми от Mac/сети.
Приватный launcher/log/probe пакет: `/tmp/aituhack-mvp/release-runtime-restart-20261019T235726Z/`.
Исходники572a813/buildBlwNsPwtVQoToEIUwspvC; документы/материалы сохраняются отдельным commit.
PPTX7slides/6min и video110s приняты независимым reviewer; новые sourcegates не требовались.
Видео/privatebuild ignoredGit и доступны локально, не считать их публично загруженными.
M7.5 phone/private-device часть остаётся непроверенной, как и M5.3 realpaid smoke.
Пока пользователь не подтвердит обновление ключа, не выполнять auth/paid retry.
