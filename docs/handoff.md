# Продолжение MVP

План утверждён. Продолжать с `next_task_id` в [tracker.yaml](../tracker.yaml),
сначала сверить in_progress reports; не повторять брейншторм/завершённые исследования.
[progress.md](progress.md) содержит актуальные проверки и ограничения.

Рабочая папка `/Users/macbook/Yernur/projects/aituhack`, ветка `codex/p0-mvp`.
M1 завершён (commit `10f4981`): scaffold/contracts/298реальныхPOI/UI390+1440/labels12RU+4negative.
M2.1–M2.3 проверены: deterministic filters/ranking + persistent single-host budget guard.
M2.4 implementation принят после3P2fix/re-review:256tests/types/lint/build/NFT PASS.
M2.4 task blocked: настоящий индекс отсутствует из-за401. Lexical top3=11/12,
Recall5macro88.33%, semantic/quality gate не пройден. M3.1–M3.4 проверены:
серверный POST/intent/grounding/ограниченный adapter и disabled-by-default eval runner.
M3.5 UI/настоящий API проверены на390/1440:465unit/46e2e/types/lint/build/NFT PASS.
Далее M4 source labels/качество и M5 профили/подробности/обе карты; статус брать из трекера.
M2.5 допускает offline продолжение по явному разрешению пользователя со stubs;
зависимость от live части M2.4 записана как waiver, не как ложный done.
Ближайший шаг всегда брать из tracker, а не из исторического текста этапа.
Runtime Node24.21.0/pnpm11.0.8. Отчёты исполнителей/review и briefs текущей сессии:
`/tmp/aituhack-mvp/`; root — единственный writer tracker.

Сборщик `scripts/astana_data.py`, `scripts/collect_astana.py` и его тесты/данные
сохранены. Не перезапускать paid collection, не перетирать и не коммитить автоматически
с application scaffold. Новый runtime catalog — `data/catalog/places.json`,
отдельный report/mapping — [collection-import.md](collection-import.md).
Все price/facts неизвестны; фильтры не ослаблять. Synthetic fixtures только для tests.

OpenRouter$0 paid calls; $2prep incl$0.50eval/$4demo reserve.
Ключ в `.env.local` присутствует, но read-only auth401; не выводить секреты,
не просить ключ в чате. Пользователь подтвердил, что ключ ещё не обновлён: auth повторно не проверять,
продолжать со stubs. APP_AI_MODE=stub выбирается явно; disabled работает по категориям,
неизвестный непустой текст уточняется. Persistent guard M2.3 проверен, paid mode выключен;
перед paid calls всё равно нужны действующий ключ, долговечное хранилище ledger
и явная серверная настройка. Serverless paid запрещён текущей реализацией. Публикация данных/physical phone/live/deployment ещё не проверены.

Всегда отдельный implementer и независимый reviewer, непересекающиеся owned files,
сразу tracker status/evidence/next после каждой проверенной подзадачи.
Дедлайн20.10.2026 23:59 Asia/Almaty, внутренняя цель20:00. Сначала текстовый P0,
голос по остаточному времени и gates плана.
