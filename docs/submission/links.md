# Проверенные ссылки и запуск

[Открыть временное HTTPS-демо](https://percentage-slim-contemporary-appropriate.trycloudflare.com).
Локальный origin: [http://127.0.0.1:3000](http://127.0.0.1:3000).

Текущая проверка20.10.2026 04:59 Asia/Almaty: HTTPS200, строгая response schema,
настоящий API/каталог и canonical hash совпали; 12 внутренних путей404, GET API405,
POST no-store, ошибки400, локальный лимит429 и контрольные лог-маркеры проверены.
Root отдельно открыл новые приватные Chromium contexts1440/390: реальный park-запрос
дал3 места, подробности/HTTPSкарты и неизвестный запрос проверены, overflow/page errors0.
Физический телефон и запуск приложений карт этим не подтверждаются.

После паузы предыдущие tool-сессии завершились. Старый адрес
`https://converter-mirrors-commercial-gem.trycloudflare.com` больше не используется.
Текущий запуск: отдельные detached processes, PID64525 (Next) и64556 (cloudflared),
PPID1/собственные process groups; launchers завершились, дети проверены вторым tool-call.
Это не системный service и не автоматический перезапуск. Mac, процессы и сеть должны
работать; после остановки/нового туннеля URL меняется. Постоянный hosting/SLA не заявлен.

Приватные launcher/probe/log receipts: `/tmp/aituhack-mvp/release-runtime-restart-20261019T235726Z/`.
Build `BlwNsPwtVQoToEIUwspvC`, исходники `572a813`, каталог не изменились.

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

SHA-256 обоих файлов записаны в release-manifest.json. Материалы проверены локально
и доступны владельцу workspace. Видео и private build/evidence игнорируются Git;
локальная ссылка на них не означает публичную загрузку или доступность в новом clone.
PPTX включает все четыре изображения внутри файла; native PowerPoint отдельно не открывался.
Физический телефон/переходы в native карты остаются непроверенными.
YouTube upload, push и официальная отправка заявки не выполнялись.
