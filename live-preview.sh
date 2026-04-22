#!/usr/bin/env bash
set -euo pipefail

# One-command Android live preview from WSL.
# Default: Expo Go + auto-open URL.
# Usage:
#   ./live-preview.sh
#   ./live-preview.sh --dev

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8081}"
MODE="expo-go"

if [[ "${1:-}" == "--dev" ]]; then
  MODE="dev-client"
fi

ADB_BIN="${ADB_BIN:-/home/polina/bin/adb}"
if [[ ! -x "$ADB_BIN" ]]; then
  echo "ERROR: adb not found at $ADB_BIN"
  echo "Set ADB_BIN env var if adb is elsewhere."
  exit 1
fi

echo "1) Проверка эмулятора..."
if ! "$ADB_BIN" devices | awk '/emulator-[0-9]+[[:space:]]+device/{found=1} END{exit !found}'; then
  echo "ERROR: Эмулятор не найден."
  echo "Сначала запусти Android эмулятор, потом повтори команду."
  exit 1
fi

echo "2) Настройка adb reverse для порта ${PORT}..."
"$ADB_BIN" reverse --remove-all >/dev/null 2>&1 || true
"$ADB_BIN" reverse "tcp:${PORT}" "tcp:${PORT}"

if [[ "$MODE" == "dev-client" ]]; then
  echo "3) Запуск Metro (dev-client режим)..."
  echo "Открой приложение SofTale RPG в эмуляторе."
  exec npm --prefix "$ROOT_DIR" run android:dev -- --localhost --port "$PORT"
fi

APP_URL="exp://127.0.0.1:${PORT}/--/?platform=android"
echo "3) Автозапуск Expo Go..."
"$ADB_BIN" shell am force-stop host.exp.exponent >/dev/null 2>&1 || true
"$ADB_BIN" shell am start -a android.intent.action.VIEW -d "$APP_URL" host.exp.exponent >/dev/null 2>&1 || true

echo "4) Запуск Metro (Expo Go режим)..."
echo "Если Expo Go не откроет проект автоматически, вставь URL вручную:"
echo "   $APP_URL"
exec npm --prefix "$ROOT_DIR" run start -- --localhost --port "$PORT" --clear
