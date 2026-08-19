#!/usr/bin/env bash
# Encerra o estudio: servidor e interface.
#
# Mata pelo padrao do comando, nao por PID guardado em arquivo: o start usa
# setsid, entao o processo sobrevive ao terminal e um arquivo de PID ficaria
# mentindo depois de um reboot. Filtra pelo diretorio do projeto para nao derrubar
# outro Node da mesma maquina.
set -euo pipefail
cd "$(dirname "$0")"
AQUI="$(pwd)"

alvos() {
  pgrep -af "node" 2>/dev/null | awk -v dir="$AQUI" '
    $0 ~ /server\/server\.mjs|vite|concurrently/ { print $1 }
  '
}

PIDS="$(alvos || true)"
if [ -z "$PIDS" ]; then
  printf '\n  Nada rodando.\n\n'
  exit 0
fi

printf '\n  encerrando: %s\n' "$(echo "$PIDS" | tr '\n' ' ')"
# shellcheck disable=SC2086
kill $PIDS 2>/dev/null || true

for _ in $(seq 1 10); do
  sleep 1
  [ -z "$(alvos || true)" ] && break
done

RESTOU="$(alvos || true)"
if [ -n "$RESTOU" ]; then
  printf '  insistindo (kill -9): %s\n' "$(echo "$RESTOU" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill -9 $RESTOU 2>/dev/null || true
fi

printf '  encerrado.\n\n'
