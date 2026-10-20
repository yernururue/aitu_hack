# Куда в Астане — Build with AI

[Демо](https://donate-cooperation-quick-annual.trycloudflare.com) · [Пакет для сабмита](docs/submission/submit-now.md)

> 20.10 22:00 Asia/Almaty: после DNS-отказа stats hostname новый публичный
> [адрес демо](https://donate-cooperation-quick-annual.trycloudflare.com) отвечает HTTPS200.
> Fresh390/1440: два настоящих stub POST и три карточки; independent SPEC/QUALITY review PASS.

Мобильный веб-помощник подбирает до трёх мест по локации, запросу и предпочтениям,
объясняет выбор и открывает маршрут во внешних картах.

**Состояние на 20 октября 2026:** [публичное демо](https://donate-cooperation-quick-annual.trycloudflare.com)
работает в режиме stub: 298 настоящих мест, строгие фильтры, до трёх карточек,
источники, подробности, демо-профили, сохранения и обе карты. Произвольный текст
и настоящие ИИ-объяснения на сайте ещё не включены.

Реальный RAG принят локально: индекс298×1536,12/12top3, Recall@5=97.22%, четыре отрицательных сценария PASS. Принятый offline source9503af2:1002unit автора/38независимых route tests и root lint/typecheck/build/strictNFT PASS. Known-key scan254файлов/59членовZIP: совпадений нет.

**Полный P0 с ИИ пока не готов.** После четвёртого отдельного бюджетного согласия новый Qwen US прогон снова остановился на первом intent:HTTP429 без стоимости,1POST/0повторов. Пятый unknown снова запретил все платные вызовы; модель не выбрана. Eval остаток$0.062359229, demo$4 сохранён. Offline подготовлен и прошёл независимое ревью один кандидат Mistral Small3.2/DeepInfra с полным резервом$0.028096; запуск и новая приёмка ещё не разрешены.
[Готовность](docs/readiness-report.md), [план](docs/live-p0-plan.md),
[трекер](tracker.yaml), [бюджет](docs/budget.md), [запуск](docs/submission/links.md).

Временная ссылка зависит от включённых Mac, сервера, туннеля и сети.
Телефон и обе нативные карты подтверждены пользователем на прежних URL той же
stub-сборки. Работа сборщика, исходные снимки и материалы PPTX/WEBM сохранены.

- [Трекер глобальных задач и подзадач](tracker.yaml)
- [Промпт и контекст для нового чата](docs/handoff.md)
- [Спецификация MVP](docs/product-spec.md)
- [План до 20 октября](docs/implementation-plan.md)
- [Контракт для сборщика данных и приложения](docs/data-contract.md)
- [Как работать с harness](docs/harness.md)
- [Исследование готовых проектов и моделей](docs/research.md)
- [Прогресс и доказательства проверок](docs/progress.md)
- [Сценарии проверки](evals/cases.json)

## Проверить подготовку

Требуется Python 3.10+; установка пакетов и API-ключ не нужны.

```sh
python3 scripts/check_harness.py
```

Эта команда проверяет документы и тестовые данные. Она не запускает приложение
и не доказывает качество RAG.

`.env.example` содержит только имена настроек и несекретные значения.
Реальный ключ OpenRouter впоследствии хранится в `.env.local` или secret-хранилище хостинга.

## Разработка

Runtime: Node24.21.0 (см. `.node-version`), pnpm11.0.8. Активируйте эту версию Node,
затем выполните:

```sh
pnpm install --frozen-lockfile
APP_AI_MODE=stub OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false pnpm dev
```

Этот режим использует настоящий каталог и детерминированный демо-разбор пяти
известных фраз. Поиск по категориям работает без ключа. Неизвестный текст требует
уточнения; ИИ-объяснения и смысловой индекс не подменяются вымышленными результатами.
Без APP_AI_MODE=stub текстовый разбор по умолчанию выключен (`disabled`).

Проверки: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm check:build-artifacts`, `pnpm test:e2e`, `pnpm eval:retrieval`.
[Индекс и текущие метрики](docs/indexing.md); [контроль расходов](docs/budget.md).

Каталог по умолчанию — `data/catalog/places.json`; исходные raw/normalized снимки
остаются локальными и не включаются в серверную сборку. См. [приёмку данных](docs/collection-import.md)
и [реальные retrieval labels](docs/evaluation-labels.md); [4 дополнительных KK-примера](docs/evaluation-kk.md)
проверяются отдельно. Цены и amenities пока неизвестны:
строгие требования по ним не ослабляются. Отзывы — короткие выдержки с источниками,
подготовленные для локальной демонстрации; права публикации источника не установлены.

## Сдача

Внутренняя готовность: **20.10.2026 20:00 Asia/Almaty**.
Крайний срок: **20.10.2026 23:59 Asia/Almaty**.
Нужны репозиторий/прототип, презентация 5–7 минут, сценарии и ограничения,
видео на YouTube с доступом по ссылке.

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
Независимое review текущего восстановления PASS. Настоящий ИИ остаётся
не выбранным/paidSTOP; это восстановление прежнего stub, не liveP0.

После независимого PASS root завершил только старый CF7982; origin70029 и новый
CF39251 сохранены. Reviewer выполнил19freshGET, проверил12assetsbyteequal,
18runtimechecksums/8UIchecksums/4screenshots/дваactualstubPOST/sourceguard/3offlineguards.
CurrentURL physicalphone не проверен; fullP0/живые ответы модели не заявлены.
