# Передача — 21 октября 2026

Заявка уже отправлена пользователем. Повторная отправка не выполнялась и не нужна.

## Текущее состояние

[Публичный интерфейс](https://facing-workshops-quote-finding.trycloudflare.com) — новый тёплый минимальный городской гид, сейчас **ИИ отключён / paid=false**. Категории, строгие фильтры, реальные места, источники и маршруты работают без ИИ. Source `4aff3b4763d689ea31ffdb76f540c03dc7b59987`, build `6OQMmPb1YJ3ddzPsvzGf9`; origin72511/3004 и tunnel70740 detached. Runtime не пересобирать на месте. Старые origin56483/tunnel39251 и live-p0 buildP3a сохранены; они используют тот же заблокированный canonical ledger, а не обход блокировки.

Редизайн: бумага/чернила/оливковый/терракота, системная Georgia с кириллицей, короткий поиск, видимые основные и активные условия, дополнительные сведения по раскрытию. Субагент реализовал, другой независимо проверил; root — единственный writer tracker. Последняя просьба пользователя — минимум контента, без повторяющихся лозунгов и неактивных настроек.

## Почему новое успешное ИИ-видео не готово

Одна разрешённая реальная попытка20октября23:54 вернула HTTP200/needs_clarification/0мест. Добавлен ровно один demo:intent:unknown: `87d82508-47ff-4ef5-9981-7aa1cfb196dc`, резерв$0.028096, actual=null. Ни upstreamHTTPstatus, ни generationID не сохранились; не придумывать причину или нулевую стоимость. Все платные вызовы остановлены, повторов не было. Успешный ролик с ИИ/местами/источниками/маршрутом — R1.4 **blocked**.

Canonical — только основной `data/private/openrouter-budget.json`, v6/40entries, uncertaintrue/unknown1/inFlight0/0600. SHA после попытки `3969ea0ebb10af4eb6a5b9bee79657550d99986a5aeb7195058e2ebc25700f87`. Prep$2/eval$1.50внутриprep/demo$4 неизменны. Известный actualprep$0.002178331; пять ранее разрешённых оценок$1.435957681 отдельно отactual; demo knownactual0 **не значит бесплатно**, резерв$0.028096/не зарезервировано$3.971904. Новый grant не дан. Не reset/copy ledger, не угадывать actual, не повторять исторические one-use operators. Возобновление paid требует подтверждённой стоимости/разрешения и отдельного reviewed решения для той же canonical ledger.

## Материалы и проверки

- [Новый UI-ролик без ИИ](../output/submission/aituhack-redesign-offline.mp4) и текущие screenshots в README; отдельная [неудавшаяся live-попытка](../output/submission/aituhack-redesign-live-attempt.mp4),49.52s. Не выдавать offline/старыйstub за успешный новыйAI.
- Lint/typecheck, root1055unit/22suites59.43s,70offlinee2e34.0s, build, strictNFT6traces/1569entries с каталогом+индексом, harness/diff прошли. UI/content/helper/failure audit independently SPEC/QUALITY PASS; финальное media/docs SPEC/QUALITY PASS, открытых замечаний нет; evidence в tracker.
- Реальные данные298POI/591выдержка/7категорий, catalogc72d13…/dataset4677a7…/index568c85…/298×1536 сохранены; повторного сбора/индексации не было. Raw/normalized/env/ledger/index не публикуются. Шесть untracked originals сборщика и data_collection tracker block не трогать.
- Original MP4/WEBM/PPTX сохранены. Физический телефон/новые native maps, полная модельная квалификация12/72/48/Qwen24, голос и постоянный hosting не закрыты. Ссылка зависит от Mac/сети/двух процессов.

Публикация принятого UI и честно помеченных материалов в main выполняется обычным push; финальная квитанция — [tracker](../tracker.yaml) и [progress](progress.md). R1.4 остаётся blocked даже после публикации. Рабочие receipts/reviews: `/tmp/aituhack-redesign-runtime/`, `/tmp/aituhack-redesign-integration/`.
