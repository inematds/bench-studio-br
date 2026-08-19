#!/usr/bin/env bash
# Sobe o estudio de forma que ele sobreviva ao fim da sessao SSH.
#
# Faz o que o runbook mandava digitar na mao (setsid + nohup + log), mas checando
# antes se ja tem um no ar — subir um segundo em cima do primeiro dava
# "porta ocupada" no meio do log e a impressao de que nada tinha subido.
set -euo pipefail
cd "$(dirname "$0")"

LOG="${BENCH_LOG:-$HOME/bench.log}"
MOBILE_LOG="${BENCH_MOBILE_LOG:-$HOME/mobile.log}"
API_PORT="${PORT:-8787}"
MOBILE_PORT="${BENCH_MOBILE_PORT:-5300}"

# `--mobile` sobe tambem a interface de celular (porta 5300). Processo a parte de
# proposito: sao duas interfaces conversando com a MESMA API, e derrubar uma nao
# pode derrubar a outra.
COM_MOBILE=0
[ "${1:-}" = "--mobile" ] && COM_MOBILE=1

em_uso() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

if em_uso "$API_PORT"; then
  printf '\n  Ja tem algo escutando na porta %s.\n' "$API_PORT"
  printf '  Se e o estudio, use ./stop.sh antes, ou veja: ss -tlnp | grep %s\n\n' "$API_PORT"
  exit 1
fi

setsid nohup npm run dev > "$LOG" 2>&1 < /dev/null &
printf '\n  subindo… (log em %s)\n' "$LOG"

# O servidor le catalogo e precos antes de escutar; 15s e o que ele leva numa VPS
# modesta. Sem essa espera, a verificacao abaixo acusaria falha de um processo
# que estava apenas carregando.
for _ in $(seq 1 30); do
  sleep 1
  em_uso "$API_PORT" && break
done

if em_uso "$API_PORT"; then
  printf '  no ar.\n\n'
  curl -s "localhost:$API_PORT/api/health" | head -c 120 || true
  printf '\n\n  authRequired na linha acima = servidor funcionando, pedindo a senha.\n'
  printf '  Interface: http://localhost:5200\n'

  if [ "$COM_MOBILE" = "1" ]; then
    if em_uso "$MOBILE_PORT"; then
      printf '  Celular:   ja estava no ar em :%s\n' "$MOBILE_PORT"
    else
      setsid nohup npm run mobile > "$MOBILE_LOG" 2>&1 < /dev/null &
      for _ in $(seq 1 20); do
        sleep 1
        em_uso "$MOBILE_PORT" && break
      done
      if em_uso "$MOBILE_PORT"; then
        printf '  Celular:   http://localhost:%s  (log em %s)\n' "$MOBILE_PORT" "$MOBILE_LOG"
      else
        printf '  Celular:   NAO subiu — veja %s\n' "$MOBILE_LOG"
      fi
    fi
  fi
  printf '\n'
else
  printf '\n  o servidor NAO subiu. As ultimas linhas do log:\n\n'
  tail -20 "$LOG"
  printf '\n  Nenhuma linha [server] acima = ele morreu no inicio; rode ./install.sh\n'
  printf '  ou npm run doctor para ver qual requisito falhou.\n\n'
  exit 1
fi
