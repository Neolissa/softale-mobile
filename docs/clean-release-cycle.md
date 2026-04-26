# Clean Release Cycle (RuStore)

Этот документ фиксирует обязательный "чистый" цикл релиза для `softale-mobile`.
Цель: повторяемый, безопасный и проверяемый процесс без утечек секретов и случайных отклонений.

## 0) Release freeze

- Влить только согласованные изменения.
- Зафиксировать версию релиза (scope и changelog).
- Остановить незапланированные правки до статуса "go/no-go".

## 1) Security hygiene (обязательно)

- Не хранить секреты в репозитории:
  - `.env`
  - `*.key`
  - keystore/password
  - токены API
- Если секреты попадали в терминал/чат/скриншоты:
  - ротировать `JWT_SECRET`, `RUSTORE_WEBHOOK_SECRET`, `YOOKASSA_WEBHOOK_SECRET`;
  - перевыпустить ключи, если есть риск компрометации.
- Проверить `.gitignore`:
  - `secrets/`
  - `.env`
  - `*.enc`
  - `*.jks`

## 2) Backend readiness

- Проверить deployment backend (Render/другой хостинг):
  - `GET /health` возвращает `{"ok":true,...}`.
- Проверить базовые API:
  - `/v1/auth/register`
  - `/v1/auth/login`
  - `/v1/auth/me`
  - `/v1/economy/me`
  - `/v1/economy/energy/claim-daily` (повторный вызов должен блокироваться).
- Для free-tier допускается `DATA_DIR=/tmp/...` (с предупреждением об ephemeral storage).

## 3) Mobile env (release mode)

Перед сборкой задать:

- `EXPO_PUBLIC_AUTH_MODE=server`
- `EXPO_PUBLIC_ECONOMY_MODE=server`
- `EXPO_PUBLIC_ECONOMY_API_BASE_URL=<public-backend-url>`

Текущий production URL проекта:

- `https://softale-mobile.onrender.com`
- `GET /health`: `https://softale-mobile.onrender.com/health`

Сборка с `localhost` для store-релиза запрещена.

## 4) Build + signing

- Собрать `aab` через профиль `rustore`:
  - `npm exec --yes eas-cli -- build -p android --profile rustore`
- Если RuStore требует upload signing key:
  - скачать keystore из EAS credentials;
  - сгенерировать `pepk_out.zip`;
  - загрузить `pepk_out.zip` + boot certificate (`.pem`).

## 5) RuStore submission pack

Обязательно подготовить:

- короткое описание;
- полное описание;
- "что нового" для версии;
- скриншоты;
- возрастной рейтинг;
- privacy policy URL;
- контакты поддержки;
- комментарий модератору (если запрошен).

## 6) Smoke test (clean Android)

Минимум:

- cold start;
- регистрация/логин;
- старт квеста;
- 1-2 шага (верно/неверно);
- daily reward (одноразовость в сутки);
- перезапуск приложения и проверка сохранения прогресса.

## 7) Go / No-Go

Release `GO`, если одновременно:

- backend health OK;
- smoke пройден;
- AAB принят консолью RuStore;
- карточка релиза заполнена без обязательных пустых полей;
- нет блокирующих ошибок в логах.

Иначе: `NO-GO`, фикс и повторный цикл с шага 2.

