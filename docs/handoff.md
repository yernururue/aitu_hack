# Продолжение MVP

План утверждён. Продолжать с `next_task_id` в [tracker.yaml](../tracker.yaml),
сначала сверить in_progress reports; не повторять брейншторм/завершённые исследования.
[progress.md](progress.md) содержит актуальные проверки и ограничения.

Рабочая папка `/Users/macbook/Yernur/projects/aituhack`, ветка `codex/p0-mvp`.
Этап1: scaffold/contracts/реальные298POI/UI390+1440/labels12RU+4negative проверены;
backend и retrieval пока не реализованы. Следом M2.1 и независимый M2.3.
Runtime Node24.21.0/pnpm11.0.8. Отчёты исполнителей/review и briefs текущей сессии:
`/tmp/aituhack-mvp/`; root — единственный writer tracker.

Сборщик `scripts/astana_data.py`, `scripts/collect_astana.py` и его тесты/данные
сохранены. Не перезапускать paid collection, не перетирать и не коммитить автоматически
с application scaffold. Новый runtime catalog — `data/catalog/places.json`,
отдельный report/mapping — [collection-import.md](collection-import.md).
Все price/facts неизвестны; фильтры не ослаблять. Synthetic fixtures только для tests.

OpenRouter$0 paid calls; $2prep incl$0.50eval/$4demo reserve.
Ключ в `.env.local` присутствует, но read-only auth401; не выводить секреты,
не просить ключ в чате. Offline/stub продолжать. Перед paid calls нужен проверенный
persistent guard M2.3. Публикация данных/physical phone/live/deployment ещё не проверены.

Всегда отдельный implementer и независимый reviewer, непересекающиеся owned files,
сразу tracker status/evidence/next после каждой проверенной подзадачи.
Дедлайн20.10.2026 23:59 Asia/Almaty, внутренняя цель20:00. Сначала текстовый P0,
голос по остаточному времени и gates плана.
