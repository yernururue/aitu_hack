# Проверенные ссылки и запуск

[Открыть временное HTTPS-демо](https://percentage-slim-contemporary-appropriate.trycloudflare.com).
[Исходники в GitHub, ветка main](https://github.com/yernururue/aitu_hack/tree/main).
Обычный push всех11исходных коммитов разрешён пользователем и проверен;
один дополнительный служебный commit фиксирует результат.

Локальный origin: [http://127.0.0.1:3000](http://127.0.0.1:3000).

Обновление20.10.2026 около13:40 Asia/Almaty: hostname QuickTunnel не разрешился
через DNS с машины аудита; внешний доступ сейчас не подтверждён. Origin отвечает200,
его HTML/12clientassets/приватные пути проверены. Успешные внешние проверки ниже
относятся к указанному раннему времени. [Аудит](../security-audit.md).

Текущая проверка20.10.2026 05:20 Asia/Almaty после M5.4: HTTPS200, реальный API/
каталог и canonical hash совпали. Root открыл новые приватные Chromium contexts1440/390:
бюджет0→0мест, явное снятие бюджета без POST, повторный поиск→3реальныхпарка;
весь запрос кроме бюджета совпал. Подробности/HTTPSкарты и неизвестный текст проверены,
overflow/page errors0. Новая сборка прошла554unit/64e2e/lint/types/build/NFT.
Локальные строгаяresponse schema/no-store/400/429/12private404/GET405 и canarylogs PASS.
Пользователь подтвердил открытие сайта и 3 карточки на физическом телефоне после снятия
бюджета. На вопрос о выбранном Ботаническом саде пользователь подтвердил:
обе кнопки 2ГИС/Google Maps открыли место в приложениях.

После паузы предыдущие tool-сессии завершились. Старый адрес
`https://converter-mirrors-commercial-gem.trycloudflare.com` больше не используется.
Текущий запуск: отдельные detached processes, PID70029 (Next) и64556 (cloudflared),
PPID1/собственные process groups; launchers завершились, дети проверены вторым tool-call.
Это не системный service и не автоматический перезапуск. Mac, процессы и сеть должны
работать; после остановки/нового туннеля URL меняется. Постоянный hosting/SLA не заявлен.

Текущий origin launcher/probe/log: `/tmp/aituhack-mvp/release-runtime-M5.4-20261020T001928Z/`.
Туннель/log receipts сохранены: `/tmp/aituhack-mvp/release-runtime-restart-20261019T235726Z/`.
Build `NASkuokYCKTpTbx_JqKpo`, исходники `ceb34a5`; каталог не изменён.
При M5.4 прежний origin64525 остановлен после проверки PID; туннель64556 сохранён,
URL остался прежним. Новый production-процесс отделён от launcher/tool session.

Для ручного перезапуска выбрать Node24.21.0/pnpm11.0.8, выполнить сборку по README,
затем явно закрепить бесплатный режим и реальный каталог:

```sh
NODE_ENV=production APP_AI_MODE=stub OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false APP_USE_SYNTHETIC=false NEXT_TELEMETRY_DISABLED=1 APP_DATASET_PATH=/Users/macbook/Yernur/projects/aituhack/data/catalog/places.json pnpm start --hostname 127.0.0.1 --port 3000
```

Туннель использует verified cloudflared2026.10.1 без аккаунта/новыхcredentials.
Остановка процессов прекращает доступ; перед остановкой сверить PID/команду.
Не удалять ledger и не включать paid ради старта. Серверный ключ не помещён в клиент.

[Release manifest](release-manifest.json), [три сценария](scenarios.md),
[границы версии](limitations.md), [сбор и импорт](../collection-import.md),
[решение по моделям](../model-decision.md).

## Материалы, принятые независимо

- [Презентация PowerPoint](../../output/submission/aituhack-demo.pptx) — 7 слайдов,
  native текст/таблицы и заметки на6мин,436736bytes.
- [Видео](../../output/submission/aituhack-demo.webm) — 110с,1440×900,VP9,беззвука,
  14034370bytes; полный decode и независимая packet/frame проверка PASS.
- [План выступления и источники](presentation-outline.md).

PPTX/видео сохранены неизменными как снимок source`572a813`/build`BlwNsPwtVQoToEIUwspvC`
(554unit/62e2e). Текущее приложение добавляет пояснение/явное снятие бюджета;
новая сборка приложения указана отдельно. SHA-256 и sourceSnapshot обоих файлов
записаны в release-manifest.json. Материалы проверены локально. PPTX также доступен
[в GitHub](https://github.com/yernururue/aitu_hack/blob/main/output/submission/aituhack-demo.pptx)
после разрешённого push; видео доступно владельцу workspace. Видео и private build/evidence игнорируются Git;
локальная ссылка на них не означает публичную загрузку или доступность в новом clone.
PPTX включает все четыре изображения внутри файла; native PowerPoint отдельно не открывался.
Сайт, 3 карточки и оба native-перехода к выбранному месту на телефоне подтверждены пользователем.
GitHub push выполнен по запросу пользователя. YouTube upload и официальная отправка заявки не выполнялись.
