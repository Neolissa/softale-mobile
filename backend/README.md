# SofTale Economy Backend Blueprint

Этот модуль описывает серверную часть экономики (XP + Энергия) для переноса текущей клиентской логики в backend.

## Цели
- Сервер как источник истины по балансу XP/Энергии.
- Идемпотентные начисления/списания.
- Анти-абьюз для промокодов, рефералок и P2P переводов.
- Единая аналитика экономических событий.

## Рекомендуемые сущности
- `users`
- `wallets` (`energy_balance`, `xp`, `level`)
- `wallet_transactions` (append-only ledger)
- `quest_progress`
- `promo_codes`, `promo_redemptions`
- `referrals`
- `energy_transfers`
- `payment_orders`, `payment_events`

## Минимальные API
- `GET /v1/economy/me`
- `POST /v1/economy/energy/claim-daily`
- `POST /v1/economy/promo/redeem`
- `POST /v1/economy/referrals/validate`
- `POST /v1/economy/energy/transfer`
- `POST /v1/economy/stage/unlock`
- `POST /v1/economy/stage/complete`
- `POST /v1/economy/payments/create`
- `POST /v1/economy/payments/webhook/rustore`
- `POST /v1/economy/payments/webhook/yookassa`

## События аналитики
- `energy_granted`
- `energy_spent`
- `energy_insufficient`
- `stage_paywall_shown`
- `stage_unlocked_paid`
- `promo_redeemed`
- `referral_validated`
- `energy_transfer_sent`
- `reactivation_bonus_granted`

## Локальный запуск backend (full-prod контур MVP)

Сервер находится в `backend/server.js` и поднимает:
- auth (`/v1/auth/register`, `/v1/auth/login`, `/v1/auth/me`)
- economy (`/v1/economy/*`)
- profile upload (`POST /v1/profile/avatar`, хранение в `DATA_DIR/uploads`)
- payments (`/v1/economy/payments/create`, webhooks RuStore/YooKassa)

### Команды

1. Установка зависимостей:
   - `npm --prefix ./backend install`
2. Запуск:
   - `npm --prefix ./backend run start`

По умолчанию сервер слушает `http://localhost:3000`.

### Переменные окружения

- `PORT` (default `3000`)
- `JWT_SECRET`
- `RUSTORE_WEBHOOK_SECRET`
- `YOOKASSA_WEBHOOK_SECRET`
- `DATA_DIR` (default `backend/data`, в production рекомендуем persistent path вроде `/var/data`)
- `STRICT_PERSISTENCE_MODE` (`true|false`): опциональный строгий режим проверки хранилища (по умолчанию выключен).
  - Не включайте его без отдельного окна на проверку инфраструктуры.

### Анти-потеря БД (обязательно для production)

- Используйте persistent disk и `DATA_DIR=/var/data`.
- Проверяйте `/health`: теперь там есть `strictPersistenceMode`, `dataDir`, `dbPath`.
- В strict-режиме сервер может не стартовать, если:
  - `DATA_DIR` не задан явно;
  - `db.json` отсутствует и нет backup в `DATA_DIR/backups`.
- Базовый production-режим остаётся без fail-fast: сервис продолжает работать, но пишет явную ошибку в лог, если не нашёл БД/backup.

### Важно по идемпотентности

- Для операций кошелька поддержан `x-idempotency-key`.
- Для webhooks проводится проверка подписи `x-signature` (HMAC SHA256).

## GitHub backup db.json (страховка)

- В backend добавлен admin endpoint: `GET /v1/admin/db/export` (только для `ADMIN` токена).
- В репозитории есть workflow: `.github/workflows/backup-db.yml`.
- Он запускается каждый час и вручную (`Run workflow`), забирает snapshot БД и пишет:
  - `backups/db-snapshots/latest/db.json`
  - `backups/db-snapshots/latest/meta.json`
  - историю в `backups/db-snapshots/history/db-*.json`

### Нужно добавить GitHub Secrets

- `BACKEND_BASE_URL` (например `https://softale-mobile.onrender.com`)
- `BACKEND_ADMIN_EMAIL`
- `BACKEND_ADMIN_PASSWORD`
