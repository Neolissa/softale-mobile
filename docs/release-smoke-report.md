# Release Smoke Report

Дата: 2026-04-23

## Backend smoke (port 3010)

- `POST /v1/auth/register` -> OK
- `POST /v1/auth/login` -> OK
- `GET /v1/economy/me` -> OK
- `POST /v1/economy/energy/claim-daily` -> OK
- idempotency (`x-idempotency-key`) -> OK (повтор вернул тот же snapshot)
- `POST /v1/economy/payments/create` -> OK
- `POST /v1/economy/payments/webhook/rustore` + HMAC signature -> OK
- Проверка баланса после webhook `paid` -> OK (energy credited)

## Client static checks

- Lints: `App.tsx`, `authApi.ts`, `economyApi.ts` -> without errors.
- `server.js` syntax check -> OK.

## Remaining before store upload

- Поднять backend в production окружении (TLS + secrets manager).
- Включить `.env` в app для `server` mode.
- Собрать Android AAB (`npm run android:release`).
- Пройти ручной UX smoke на реальном Android-устройстве.
