#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/secrets"
PLAIN_FILE="${SECRETS_DIR}/rustore_api.key"
ENC_FILE="${SECRETS_DIR}/rustore_api.key.enc"

mkdir -p "${SECRETS_DIR}"

echo "Вставь RuStore API key, затем Enter и Ctrl+D:"
cat > "${PLAIN_FILE}"

if [[ ! -s "${PLAIN_FILE}" ]]; then
  echo "Пустой ключ. Прерываю."
  rm -f "${PLAIN_FILE}"
  exit 1
fi

echo "Придумай пароль для шифрования (не сохраняется в репозитории)."
openssl enc -aes-256-cbc -pbkdf2 -salt -in "${PLAIN_FILE}" -out "${ENC_FILE}"
rm -f "${PLAIN_FILE}"

echo
echo "Готово:"
echo "- Зашифрованный ключ: ${ENC_FILE}"
echo "- Оригинал удален: ${PLAIN_FILE}"
echo
echo "Проверка расшифровки:"
echo "openssl enc -d -aes-256-cbc -pbkdf2 -in \"${ENC_FILE}\""
