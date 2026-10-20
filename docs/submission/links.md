# Проверенные ссылки и запуск

[Открыть временное HTTPS-демо](https://loan-begins-sleeps-unavailable.trycloudflare.com).
[Исходники в GitHub, ветка main](https://github.com/yernururue/aitu_hack/tree/main).
[Отчёт: что готово и что осталось](../readiness-report.md).

Проверка20.10.2026 около14:12 Asia/Almaty: новый адрес отвечаетHTTPS200.
Прежний `percentage-slim-contemporary-appropriate.trycloudflare.com` не разрешался
через DNS с машины аудита; старый connector сообщал о повторных обрывах соединения.
Точная причина не установлена. Восстановлен только туннель, приложение/данные не менялись.
Исторический DNS-WARN M7.7 сохранён в [аудите](../security-audit.md).

Свежие приватные Chromium contexts: мобильный390×844 и настольный1440×900.
Всего8настоящих POST без mocks: мобильные поиск/бюджет0/явное снятие/повторный поиск,
профиль/сохранение/скрытие/неизвестный текст и настольный базовый поиск.
EXPO/«Хочу погулять»/5км/пустой бюджет→3реальныхпарка, canonical hash совпал.
Бюджет0→0мест, кнопка снятия не делает POST, остальные условия сохранены;
последующая отправка→3. Подробности/источники и обе HTTPS-карты в двух режимах,
ID-only storage/reload/reset проверены. Overflow/page errors/devbadge0.
Переходы во внешние карты в этой браузерной проверке не выполнялись.

На той же сборке пользователь ранее подтвердил сайт и три карточки на физическом
телефоне; обе карты открыли выбранный Ботанический сад в приложениях.
Для нового URL пользователь ответил: «Открылся, три карточки есть».
Повторный native-переход в этом ответе не подтверждён; устройство и браузер не указаны.
Для показа: EXPO → «Хочу погулять» →5км →бюджет пустой →«Найти места».

Проверка публичной отдачи: все12clientassets200 побайтово совпали с текущей сборкой,
все9ссылок из HTML покрыты;51приватный путь404, четыре directoryURL308 с отдельным
каноническим404; GET API405. Known-secret URL/body guard включён, совпадений0.
Три актуальных лога mode0600, canaries отсутствуют. Платных/provider/auth-вызовов0.
Предыдущие проверки той же сборки:554unit/64e2e/lint/types/build/NFT PASS.

Локальный origin: [http://127.0.0.1:3000](http://127.0.0.1:3000).
Текущие detached processes: PID70029 (Next) и80285 (cloudflared),
PPID1/собственные process groups; launcher туннеля80282 завершился, ребёнок жив
после завершения launcher и в следующем tool-call. Прежний tunnel64556 остановлен
только после проверки нового адреса. Production-процесс не перезапускался.
Это не системный service и не автоматический перезапуск. Mac, процессы и сеть
должны работать; при новом туннеле URL меняется. Постоянный hosting/SLA не заявлен.

Origin launcher/probe/log: `/tmp/aituhack-mvp/release-runtime-M5.4-20261020T001928Z/`.
Текущий tunnel/probe/log: `/tmp/aituhack-mvp/public-restore-20261020/`.
Свежая браузерная проверка: `/tmp/aituhack-mvp/public-ui-recheck/`.
Build `NASkuokYCKTpTbx_JqKpo`, исходники `ceb34a5`; каталог не изменён.

Для ручного запуска выбрать Node24.21.0/pnpm11.0.8. Не пересобирать `.next`, пока
текущий production использует эту папку. После остановки и сборки по README
закрепить бесплатный режим и реальный каталог:

```sh
NODE_ENV=production APP_AI_MODE=stub OPENROUTER_PAID_ENABLED=false LIVE_EVAL_ENABLED=false APP_USE_SYNTHETIC=false NEXT_TELEMETRY_DISABLED=1 APP_DATASET_PATH=/Users/macbook/Yernur/projects/aituhack/data/catalog/places.json pnpm start --hostname 127.0.0.1 --port 3000
```

Туннель использует verified cloudflared2026.10.1 без аккаунта/новыхcredentials.
Остановка процессов прекращает доступ; перед остановкой сверить PID/команду.
Не удалять ledger и не включать paid ради старта. Ключ остаётся только на сервере.

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
Сайт, 3 карточки и оба native-перехода подтверждены пользователем на той же сборке
по прежнему URL; для нового адреса подтверждены открытие сайта и три карточки,
повторный запуск приложений карт не сообщался.
GitHub push выполнен по запросу пользователя. YouTube upload и официальная отправка заявки не выполнялись.
