#!/usr/bin/env bash
# Encerra o estudio: servidor e interface.
#
# A primeira versao disto se matava sozinha. Ela procurava qualquer processo cuja
# linha de comando citasse "server/server.mjs", "vite" ou "concurrently" — e a
# propria linha de comando do shell que roda este script cita exatamente isso.
# Resultado: o script derrubava o proprio terminal e morria antes de encerrar o
# estudio, entao "o stop nao funcionou" era literalmente verdade.
#
# Agora sao tres filtros, e os tres importam:
#   1. padroes que casam com o PROCESSO, nao com quem fala dele;
#   2. o diretorio de trabalho tem que estar dentro deste projeto — assim outro
#      estudio, ou outro projeto com Vite na mesma maquina, nao e atingido;
#   3. nunca este script, nem o shell que o chamou.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd -P)"

PADROES='server/server\.mjs|node_modules/\.bin/concurrently|node_modules/vite/bin/vite\.js|node_modules/\.bin/vite'

alvos() {
  local pid cwd
  for pid in $(pgrep -f "$PADROES" 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "${PPID:-0}" ] && continue
    # Sem /proc nao da para provar de quem e o processo: melhor nao matar.
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [ -n "$cwd" ] || continue
    case "$cwd" in
      "$ROOT"|"$ROOT"/*) printf '%s\n' "$pid" ;;
    esac
  done
}

PIDS="$(alvos)"
if [ -z "$PIDS" ]; then
  printf '\n  Nada rodando neste projeto.\n'
  printf '  (se algo responde nas portas, veja de quem e: ss -tlnp | grep -E "5200|5300|8787")\n\n'
  exit 0
fi

printf '\n  encerrando: %s\n' "$(echo "$PIDS" | tr '\n' ' ')"
# shellcheck disable=SC2086
kill $PIDS 2>/dev/null || true

for _ in $(seq 1 10); do
  sleep 1
  [ -z "$(alvos)" ] && break
done

RESTOU="$(alvos)"
if [ -n "$RESTOU" ]; then
  printf '  insistindo (kill -9): %s\n' "$(echo "$RESTOU" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill -9 $RESTOU 2>/dev/null || true
  sleep 1
fi

if [ -z "$(alvos)" ]; then
  printf '  encerrado.\n\n'
else
  printf '  ainda ha processo vivo: %s\n' "$(alvos | tr '\n' ' ')"
  printf '  veja o que e antes de insistir: ps -fp $(alvos | tr "\\n" "," | sed "s/,$//")\n\n'
  exit 1
fi
