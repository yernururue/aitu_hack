# Куда в Астане — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Current task status lives in [tracker.yaml](../tracker.yaml); update it after every finished subtask. Checkboxes below are the detailed checklist and must stay consistent with the tracker.

**Goal:** К 20.10.2026 20:00 Asia/Almaty подготовить проверенный RAG MVP,
развёрнутое демо и комплект сдачи; крайний срок 23:59.

**Architecture:** Один Next.js проект: нормализованный POI-каталог и сохранённый
индекс на сервере, геофильтры/ранжирование кодом, структурированные вызовы
OpenRouter для намерения и объяснений. Факты подставляются из каталога.

**Tech Stack:** Next.js, React, TypeScript strict, Tailwind, shadcn/ui, Zod,
OpenRouter, JSON + embeddings, Vitest, Playwright, pnpm, Vercel.

**Spec:** [product-spec.md](product-spec.md).

## Global Constraints

- Выдавать 0–3 места только из загруженного каталога и прошедших фильтры.
- Текущий запрос важнее демо-профиля. Не ослаблять ограничения молча.
- Synthetic fixtures предназначены только для тестов. Не выдавать их за собранные POI.
- Основной язык — русский; точные координаты и аудио не сохраняются в логах.
- Размеры QA: 390 и 1440 px. Навигация — внешние 2ГИС/Google Maps.
- Бюджет OpenRouter: $2 на всю подготовку/индексацию/разработку/тесты/повторы,
  $4 только на демо; live-сравнение максимум $0.50 внутри подготовительных $2.
- План утверждён пользователем 19.10.2026. Реализация разрешена без повторного
  согласования; следующий чат начинает этап 1 по tracker.yaml.

## Review Focus

1. Русские/казахские названия и опечатки не исчезают при токенизации — этап 2.
2. Отказ геолокации и неподдерживаемый микрофон оставляют рабочий текстовый путь — этапы 1/6.
3. Неизвестные часы, цены и розетки не превращаются в положительные факты — этапы 2/3.
4. Пустой ответ, timeout, 429, неверный JSON и выдуманный ID не ломают карточки — этап 3.
5. Смена профиля/быстрые запросы не показывают старую выдачу; ссылки ведут к верным
   координатам и имеют web fallback — этап 5.

## Расписание и зависимости

Если старт реализации сдвигается, сохранять порядок и границы сокращения.
Время ниже — план, не обещание длительности. Параллельно отдельный агент продолжает сбор.

| Когда (Asia/Almaty) | Результат |
|---|---|
| 19 октября, текущая сессия | Harness, контракт, исследование, утверждение плана |
| 20 октября 09:00–10:30 | Этап 1: приложение и первый реальный срез данных |
| 10:30–12:00 | Этап 2: поиск/фильтры; ранняя preview-сборка |
| 12:00–13:30 | Этап 3: полный текстовый RAG-путь |
| 13:30–14:15 | Этап 4: сравнение моделей и качество поиска |
| 14:15–16:00 | Этап 5: профиль, детали, ссылки, адаптивность |
| 16:00–17:00 | Этап 6: голос, если P0 уже проходит |
| 17:00–17:30 | Исправление блокеров; заморозка новых функций |
| 17:30–18:30 | Этап 7: размещение, финальные проверки |
| 18:30–20:00 | Слайды, запись и загрузка видео, проверка ссылок |
| 20:00–23:59 | Резерв сдачи и исправлений; расширение scope запрещено |

Если к 13:30 нет текстового end-to-end, голос исключается из этой сдачи.
Если к 16:00 P0 нестабилен, прекращаются анимации, новые категории и расширение профиля.
Если данные опаздывают: UI делается на подписанных fixtures, но финальный gate
требует реальный автоматизированный срез. Synthetic-демо не объявлять выполнением сбора.

## Карта будущих файлов

| Путь | Ответственность |
|---|---|
| `src/app/page.tsx`, `layout.tsx`, `globals.css` | Компоновка и стили |
| `src/components/{search-form,place-card,place-details,profile-switcher}.tsx` | UI |
| `src/lib/contracts/{poi,request,response}.ts` | Zod и производные TS-типы |
| `src/lib/data/{catalog,normalize}.ts` | Импорт и чтение снимка |
| `src/lib/search/{intent,filters,rank,retrieve,index}.ts` | Поиск и ранжирование |
| `src/lib/ai/{openrouter,explain,validate}.ts` | Серверный вызов и проверка ответа |
| `src/lib/recommend.ts` | Сборка полного ответа из поиска, объяснения и POI |
| `src/lib/{geo,navigation,profiles}.ts` | Расстояния, ссылки, демо-история |
| `src/app/api/recommend/route.ts` | HTTP-граница |
| `src/app/api/transcribe/route.ts` | Опциональный голос |
| `scripts/{import-poi,build-index,eval-retrieval,eval-live}.ts` | Воспроизводимые команды |
| `scripts/collect/` | Переданные сборщиком скрипты/workflow, зависимости и инструкция запуска |
| `tests/unit/`, `tests/e2e/` | Проверки поведения |
| `docs/submission/` | Сценарии, ограничения, презентация/ссылки |

Scaffold Next.js и runtime-схемы созданы и проверены (M1.1/M1.2). Сборщик оставил scripts/astana_data.py,
scripts/collect_astana.py, scripts/test_astana_data.py и локальную выгрузку
data/normalized/astana/. Сначала проверить совместимость; не перетирать и
не перемещать файлы сборщика без необходимости. Harness — отдельная подготовка.

Типы экспортируются из одного места: poi.ts → Poi/Catalog/Coordinates/FactKey;
request.ts → RecommendRequest/Filters/ProfileId/Intent; response.ts →
Recommendation/RecommendResponse; search/index.ts → Index; search/rank.ts →
RankedPoi/RankingContext; ai/validate.ts → GeneratedItems. Производные типы
выводятся из Zod, а не дублируются вручную.

## Этап 1. Запускаемое приложение и вход данных

**Files:** package/lockfile, Next/TS/Vitest/Playwright configs, app shell,
contracts, data/normalize, scripts/import-poi.ts, tests/unit/import.test.ts,
tests/e2e/search-shell.spec.ts, workflow CI.

**Interfaces:** `normalizePoi(raw: unknown): Poi`; `loadCatalog(): Promise<Catalog>`;
`RecommendRequestSchema`, `PoiSchema`, `RecommendResponseSchema` по контракту.
Производит валидный каталог и UI, готовый подключиться к API.

- [x] Проверить Node LTS, совместимость Next/React и pnpm; зафиксировать runtime
  и lockfile. Локально сейчас Node 26.5.0; не считать его обязательным runtime.
- [x] Создать Next/TS strict проект в существующей папке, сохранив harness.
- [x] Добавить отдельные shadcn Button/Input/Card/Sheet и Zod; записать лицензии.
- [x] Написать failing import test: null часы/рейтинг остаются null, source IDs
  разрешаются, неверная широта и дубли ID отклоняются.
- [x] Запустить `pnpm test -- tests/unit/import.test.ts`: ожидается FAIL до реализации.
- [x] Реализовать схемы/импорт, отчёт rejected и loadCatalog; получить 20–30 реальных POI.
- [x] Получить и проверить комплект автоматизированного сбора; сохранить в
  scripts/collect/ после удаления секретов и проверки права использования.
  Инструкция должна воспроизводить хотя бы маленькую выборку из источника.
- [x] Вместе с первым срезом начать разметку 12 реальных запросов и подходящих ID
  для этапа 4; бюджет трактовать на человека, неприводимые цены — unknown.
- [x] Реализовать shell с пресетами локации и вводом; при отказе geolocation
  показать ручной выбор. Synthetic fixture всегда имеет видимый demo watermark.
- [x] M1.2a: ограничить filesystem tracing каталогом; проверить отсутствие raw/private/env и исходников сборщика в production NFT.
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`: все exit 0.
  Создать scripts для этих имён команд; tests:e2e пока может проверять только shell.
- [x] Проверить 390/1440 px и отказ разрешения в браузере; сохранить evidence.
- [x] Обновить прогресс; создать отдельный коммит этапа после проверки.

## Этап 2. Поиск, расстояния и жёсткие ограничения

**Files:** search/{filters,rank,retrieve,index}, geo.ts, profiles.ts,
scripts/build-index.ts, scripts/eval-retrieval.ts, tests/unit/{filters,retrieve,index}.test.ts.

**Consumes:** Poi[], Intent, каталог этапа 1.
**Produces:** `filterCandidates(pois: Poi[], intent: Intent, origin: Coordinates,
now: Date): Poi[]`; `rankCandidates(candidates: Poi[], context: RankingContext): RankedPoi[]`;
`retrieve(request: RecommendRequest, intent: Intent, now: Date): Promise<RankedPoi[]>`.
`RankedPoi = {poi: Poi, distanceM: number, score: number,
visitMinutes: {min: number, max: number, isEstimate: true}}`.
`RankingContext = {query: string, origin: Coordinates, profileId: ProfileId|null,
savedIds: string[], dismissedIds: string[], intent: Intent, now: Date,
queryVector: number[]|null, index: Index|null,
semanticScores?: Readonly<Record<string,number>>}`.
`intent/now` нужны для ограничения оценки посещения по длительности и закрытию.
`semanticScores` — только серверная инъекция конечных нормализованных0–1значений;
HTTP её не принимает. `retrieve` допускает необязательный четвёртый аргумент
server-only dependencies (catalog/provider) для детерминированных тестов.

- [x] Написать failing tests по eval cases: радиус, бюджет с неизвестной ценой,
  outlet confirmed/reported, неизвестные/ночные часы, no-match, Unicode RU/KK.
- [x] Проверить FAIL через `pnpm test -- tests/unit/filters.test.ts tests/unit/retrieve.test.ts`.
- [x] Использовать geolib getDistance либо одну протестированную реализацию
  Haversine; название поля distanceKind всегда straight_line.
- [x] Реализовать фильтры и ranking с весами spec; применять ограничения раньше score.
- [x] Реализовать кодовую оценку посещения и отсечение по закрытию из контракта;
  тестировать открытый overnight и недостаток времени до закрытия отдельно.
- [x] Подготовить retrieval runner для размеченных случаев; JSONL с expected/actual IDs.
- [x] До первого платного вызова реализовать единый spend guard и журнал usage
  для embeddings/LLM/аудио/повторов: лимит подготовки $2, live-eval $0.50 внутри него,
  резерв демо $4. Проверять прогноз до вызова и usage после; ограничить concurrency,
  резервировать стоимость in-flight вызовов, запретить новые вызовы при неизвестном
  расходе. Тестировать отказ при превышении с provider stubs. .env не является guard.
- [ ] Сформировать документы и индекс через OpenRouter embeddings после настройки
  ключа; не отправлять сырые выгрузки целиком и не повторять индексацию без смены hash.
- [x] Проверить отказ от смешанных dimensions/model/hash; lexical fallback явно помечен.
- [x] Запустить unit tests и `pnpm build`, записать фактическое число POI и модель индекса.
  M2.4 code принят: 256tests/build/NFT PASS. Каталог298; настоящего индекса нет (401),
  кандидат text-embedding-3-small/1536. Lexical Recall@5 88,33%, gate не пройден.
  Продолжение offline со stubs разрешено пользователем; M2.4 остаётся blocked.
- [ ] Развернуть ранний preview при доступе к хостингу, проверить загрузку snapshot.
  Read-only Vercel auth вернул403; preview не развёрнут.
- [x] Зафиксировать проверенный offline этап отдельным коммитом: `57ce0f2`.
  Actual live-index task остаётся blocked, а не done.

## Этап 3. Структурированный RAG и полный текстовый путь

**Files:** search/intent.ts, ai/{openrouter,explain,validate}.ts, lib/recommend.ts,
api/recommend/route.ts, components/place-card.tsx,
tests/unit/{intent,recommend,grounding}.test.ts.
Также подготовить scripts/eval-live.ts и tests/unit/eval.test.ts для запуска этапа 4.

**Consumes:** retrieve(), схемы, RankedPoi[].
**Produces:** `parseIntent(query, filters, explicitFilterKeys, serverDeps): Promise<Intent>`;
`explain(candidates: RankedPoi[], intent: Intent, serverContext): Promise<GeneratedItems>`;
`recommend(request: RecommendRequest, serverDeps): Promise<RecommendResponse>`.
`serverDeps` включает clock/deadline/provider injection только на сервере; HTTPv1 неизменён.
Raw LLM-ответ — envelope `{items:[...]}` из data-contract. `GeneratedItems` —
проверенный массив элементов этого envelope; factual enrich выполняет recommend.

- [x] Написать failing tests с поддельным upstream: unknown poiId/evidenceId,
  повреждённый JSON, обрыв ответа, 429, отдельные intent/embedding/explanation timeout,
  конфликт явных фильтров, уточнение defaults текстом, prompt injection в отзыве.
- [x] Убедиться, что тесты FAIL до реализации.
  M3.1:110declared cases; root4missing-module suites RED,0assertions; independenttestsreview PASS.
- [x] Реализовать один серверный OpenRouter adapter через fetch; JSON Schema,
  require_parameters, timeout 15 s на вызов, общий deadline 25 s на запрос.
  Не более одной повторной попытки в оставшемся deadline. Не раскрывать ключ.
- [x] Ограничить контекст 8 кандидатами, результат 3 карточками, intent output
  400 токенов, explanation output 1000 токенов. Reasoning none/минимум по поддержке.
- [x] Реализовать whitelist ID, схему и обогащение фактами из каталога;
  для unavailable AI вернуть помеченный каталоговый fallback, не фиктивный AI-текст.
  Это допустимо только после успешного intent: при его отказе непустой запрос
  получает needs_clarification без карточек. visitMinutes вычисляет код.
- [x] Подготовить live runner: без opt-in он не вызывает сеть, лимит проверяется
  до батча; фиксированный candidate context и отдельная проверка intent.
- [x] Подключить форму и loading/empty/error; отменять устаревший запрос.
- [x] `pnpm test -- tests/unit/intent.test.ts tests/unit/recommend.test.ts tests/unit/grounding.test.ts`
  и полный `pnpm build` проходят. В браузере поиск → 1–3 карточки на реальных данных.
- [x] Записать стоимость и проверенные источники; коммит offline этапа.
  M3: root465unit/46e2e/types/lint/build/NFT/harness PASS, task reviews PASS.
  API и UI используют реальный каталог298, явные stubs; OpenRouter paid0.
  Платная проба не выполнена: пользователь подтвердил отсутствие обновлённого ключа.

## Этап 4. Выбор модели и проверка качества

**Files:** подготовленные scripts/eval-{retrieval,live}.ts, evals/real-cases.json,
evals/results/ (ignored), tests/unit/eval.test.ts, docs/model-decision.md.
**Interface:** runner читает cases, выводит per-case JSONL и aggregate summary;
никаких реальных запросов при LIVE_EVAL_ENABLED=false.

- [x] Завершить начатую в этапе 1 разметку 12 русских запросов и источников;
  добавить 4 казахских запроса при наличии пригодных описаний.
- [x] Подтвердить тест этапа 3: live runner без opt-in не вызывает сеть;
  превышение прогнозного лимита прекращает запуск до следующего батча.
- [x] Отдельно проверить retrieval: ожидаемое место top-3 ≥10/12; кандидатный
  Recall@5 ≥90% по размеченным релевантным ID, не только по одному найденному месту.
M4.2: lexical12/12top3, macro97,22%,4/4negative/hardPASS; semantic=false,
поэтому общий runner exit1. M4.3–M4.4 blocked: ключ401 и Haiku reserve$1.32>$0.50.

- [ ] На одинаковом frozen candidate context сравнить Luna, Haiku и Qwen.
  Отдельно измерить извлечение intent. Не смешивать изменение индекса со сменой LLM.
- [ ] Запуск `pnpm eval:live` только с реальным ключом и лимитом $0.50; записать
  model/provider, schema validity, unsupported facts, abstention, latency, usage/cost.
- [ ] Выбрать прошедшую модель по correctness → latency → cost. Если все проваливают
  факты, исправлять pipeline/prompt, а не объявлять лучшую из невалидных готовой.
- [ ] Сохранить решение и примеры ошибок; synthetic/real результаты разделить; коммит.

## Этап 5. Профили, подробности и маршрут

**Files:** components/{place-details,profile-switcher}.tsx, profiles.ts,
navigation.ts, tests/unit/{profiles,navigation}.test.ts,
tests/e2e/recommendation-flow.spec.ts.

**Interface:** `buildNavigationLinks(poi: Poi, mode: "walking"|"driving"): Navigation`;
`loadLocalPreferences(): {savedIds: string[], dismissedIds: string[]}`.

- [x] Написать failing tests: явный bowling побеждает coffee-профиль;
  localStorage повреждён → пустые настройки; reset очищает демо-историю;
  Google lat,lon и 2ГИС lon,lat не перепутаны; ссылка адресует выбранный филиал.
- [x] Реализовать профили и сохранения, подробности/источники, условные отзывы/social.
- [x] Подключить HTTPS-ссылки по официальной документации и тестировать обе карты.
- [x] Реализовать «Что учтено», ярлык демо-профиля, неизвестность часов и оценки времени.
- [x] Playwright: поиск → подробности → внешний URL; смена профиля; новый запрос
  обгоняет старый; denied geolocation; пустой ответ; мобильная клавиатура и focus.
- [ ] `pnpm test:e2e` на 390/1440 и полный quality gate проходят; ручная проверка
  хотя бы одного физического телефона. Зафиксировать реальные ограничения; коммит.
  CI/e2e используют детерминированные provider stubs, не расходуют кредиты;
  отдельно записать один ручной live smoke на реальном датасете.


M5.1–M5.2 done: root554unit/62e2e/390+1440/types/lint/build/NFT PASS, independentreviewPASS.
M5.3 blocked только на реальном paid live smoke;
ключ не обновлён, продолжение со stubs разрешено явно. Offline UI не объявляется полной RAG acceptance.

M5.4 done: пользовательский0бюджет объяснён, добавлены переход к полю и явное снятие
только бюджета без автопоиска. RED2→GREEN, independentSPEC/QUALITYPASS; root554unit/
64e2e390+1440/lint/types/build/NFT/harness PASS. Public private390/1440 подтвердил
строгий0→0/явнаяочисткабезPOST/null→3реальныхпарка при сохранении остальных условий.
Source`ceb34a5`, build`NASkuokYCKTpTbx_JqKpo`. Пользователь подтвердил физический доступ
к сайту, 3 карточки после снятия бюджета и открытие выбранного Ботанического сада
в приложениях 2ГИС и Google Maps. Paid live smoke ещё не выполнен.

## Этап 6. Голос (P1, максимум один час)

**Files:** components/voice-input.tsx, api/transcribe/route.ts,
tests/unit/transcribe.test.ts, tests/e2e/voice-fallback.spec.ts.
**Interface:** POST multipart audio → `{text: string}`; запрос с текстом идёт обычным путём.

- [ ] Проверить актуальный audio endpoint OpenRouter и цену отдельно от текстовой модели.
  Текстовая Luna/Haiku не считаются автоматически способными принимать аудио.
- [ ] Failing tests: unsupported MIME/файл >5 MB/запись >20 s/отказ разрешения.
- [ ] Запись, остановка, отправка, распознанный редактируемый текст; уведомление о провайдере.
- [ ] Проверить iPhone Safari/Android Chrome при наличии устройств; при недоступности
  голос скрыт/пояснён, текст работает. Никаких сохранённых аудиофайлов.
- [ ] Если к 17:00 не готово — отключить feature flag и описать ограничение; коммит.


M6.1–M6.3 skipped: P1 gate не выполнен при незавершённых semantic/live P0 проверках
и нерабочем ключе. Голос не реализован/не включён, аудио не отправлялось.
Это решение по gate, не утверждение, что отсечка17:00 уже прошла.

## Этап 7. Сдача и подтверждение результата

**Files:** docs/submission/{scenarios,limitations,presentation-outline,links}.md,
deployment config при необходимости, финальный docs/progress.md.

- [x] Зафиксировать dataset hash, число POI, источники, время сбора и актуальную модель.
  M7.1: release-manifest.json сверён с реальным каталогом и build после финального fix;
  source572a813, mode=stub/model=null/index=null, voiceoff, fullP0Accepted=false.
- [x] `python3 scripts/check_harness.py`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, `pnpm test:e2e`, `pnpm eval:retrieval` — записать каждый результат.
  M7.2: independent OFFLINE SCOPE PASS; 554unit/62e2e/прочие gates0;
  retrieval exit1/semantic=false сохранён явно, полный P0 не принят.
- [x] Проверить публичное демо, API-key только server-side, лимиты, отсутствие raw
  координат/запросов/аудио в логах. Указать использованную локацию и данные в UI.
- [x] Подготовить 5–7 минут: проблема → сценарий → RAG/сбор → персонализация →
  качество/ограничения → развитие/бизнес-гипотеза.
- [x] Записать три сценария на реальных POI, отдельно показать воспроизводимый сбор.
- [ ] Загрузить видео на YouTube по запросу пользователя на этапе публикации;
  подготовка видео сама по себе не считается разрешением публикации.
- [ ] Проверить права доступа ко всем ссылкам в приватном окне; зафиксировать их.
- [x] Финальный коммит и локальная передача пользователю; push/публичную сдачу выполнять в
  пределах актуального разрешения пользователя, не считать локальный commit отправкой.

M7.4 done:7slides/native43text/2tables/notes360s +continuous110sVP9/audio0,
independent artifact SPEC/QUALITY PASS. Public upload/YouTube/submission не выполнялись.

M7.5: локальная передача/материалы сохранены da659ed,57local links и private
Chromium390/1440 PASS; сайт и 3 карточки на физическом телефоне подтверждены пользователем,
обе кнопки карт открыли выбранное место в native-приложениях.
Итоговый статус M7 — в tracker.yaml; полная P0 RAG-приёмка не пройдена.
Следующий внешний P0 gateM2.4 без authretry до обновления ключа.

M7.6 done: по прямому запросу пользователя выполнен обычный push всей истории
в `origin/main` (GitHub yernururue/aitu_hack); remote tip/defaultbranch проверены.
До служебной записи11коммитов, дополнительный commit фиксирует результат push.
PPTX опубликован вместе с кодом; видео/YouTube/официальная отправка не выполнялись.
Реальный индекс/live/model gates остаются blocked; paid0 и резерв$4 сохранены.

M7.7 done: повторная проверка normalized→catalog298/591, byteEXACT replay и
local/Git/origin secret audit PASS в перечисленных границах; publicDNSWARN
сохранён как исторический receipt прежнего адреса. Ключи не выводились.

M7.8 done: восстановлен только публичный туннель, новыйURL и actual8POST проверены:
мобильный390 — поиск/0vsnull/профили/history/подробности/карты/уточнение,
настольный1440 — базовый поиск. Build/source/catalog неизменны, публичные12assets
byteEXACT/private55closed/GET405/secretguardPASS. Текущий адрес и точный статус
в [отчёте о готовности](readiness-report.md) и tracker. Для новогоURL пользователь
подтвердил открытие сайта и три карточки; повторный native-переход не сообщался.
Прежние native-карты подтверждены пользователем на той же сборке по старому адресу.
Независимый SPEC/QUALITY review PASS. Никаких auth/provider/paid-вызовов; fullP0Accepted=false.

M2.6: пользователь обновил ключ, auth200. Ровно3paid diagnostic POST стоят
$0.00024488; два GPT‑6 Luna chat schema/evidencePASS, embedding HTTP200
остановлен на native-model alias до1536 validation. Реальный индекс/выбор модели/
полный RAG пока не приняты. Уточнённые шаги в [live-p0-plan.md](live-p0-plan.md);
следующий M2.4 — exact alias RED/fix/review, затем cached298index. Ledger уже
инициализирован, повторять diagnostics/обнулять бюджет нельзя; publicstub сохранён.
