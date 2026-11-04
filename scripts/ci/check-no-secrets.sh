#!/bin/sh
# Risonix — verifica che nessun segreto/PHI entri nei file tracciati (P0-09).
#
# Uso: ./scripts/ci/check-no-secrets.sh  (dalla radice del repository)

set -eu

echo "[ci] verifica dei path sensibili ignorati"

# `.env` non deve essere tracciato e deve essere ignorato.
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo "ERRORE: .env è tracciato nel repository" >&2
    exit 1
fi
if ! git check-ignore -q .env; then
    echo "ERRORE: .env non è escluso da .gitignore" >&2
    exit 1
fi

# Nessun file sotto secrets/ deve essere tracciato.
if git ls-files --error-unmatch secrets/ >/dev/null 2>&1; then
    echo "ERRORE: file tracciati sotto secrets/" >&2
    exit 1
fi

echo "[ci] scansione di pattern di segreti nei file tracciati"

patterns='-----BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]+'

if git grep -nE -e "$patterns" -- . ':(exclude)*.example' ':(exclude)*.md'; then
    echo "ERRORE: possibili segreti rilevati nei file tracciati" >&2
    exit 1
fi

echo "[ci] nessun segreto rilevato"
