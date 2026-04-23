# RuStore Release Checklist (SofTale)

## 1. Secrets and security

- [ ] `secrets/` is not tracked by git.
- [ ] RuStore API key is stored only as encrypted artifact (`.enc`) locally.
- [ ] CI/CD secrets are configured (`JWT_SECRET`, `RUSTORE_WEBHOOK_SECRET`, `YOOKASSA_WEBHOOK_SECRET`).
- [ ] Access to production keys is restricted to release owners.

## 2. Backend readiness

- [ ] Backend starts: `npm --prefix ./backend run start`.
- [ ] Health endpoint responds: `GET /health`.
- [ ] Auth flow works: `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/me`.
- [ ] Economy endpoints return consistent wallet state.
- [ ] Idempotency works for money/energy operations (`x-idempotency-key`).

## 3. Payments readiness

- [ ] `POST /v1/economy/payments/create` creates order.
- [ ] RuStore webhook validates signature and updates order.
- [ ] YooKassa webhook validates signature and updates order.
- [ ] Duplicate webhook events do not create duplicate credits.

## 4. Mobile client readiness

- [ ] `.env` configured:
  - `EXPO_PUBLIC_AUTH_MODE=server`
  - `EXPO_PUBLIC_ECONOMY_MODE=server`
  - `EXPO_PUBLIC_ECONOMY_API_BASE_URL=<backend-url>`
- [ ] Login/register works against backend.
- [ ] Profile sync persists across relaunch and device restart.
- [ ] Economy actions (daily claim, transfer, stage unlock) work in server mode.

## 5. Build and publish

- [ ] Version code/version name bumped.
- [ ] Production AAB build generated (`eas build -p android --profile production`).
- [ ] Smoke test on clean device.
- [ ] RuStore metadata prepared (description, screenshots, privacy policy, contacts).
- [ ] Post-release monitoring enabled (errors, payment failures, auth failures).
