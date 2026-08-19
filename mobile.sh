#!/usr/bin/env bash
# MOBILE — sobe (ou derruba) so a interface de celular, na porta 5300.
#
# Ela e um processo SEPARADO do estudio: as duas interfaces conversam com a
# mesma API, e derrubar uma nao pode derrubar a outra. Por isso existe um verbo
# so para ela — e por isso este script confere a API antes de subir: sem API, a
# tela do celular abre e nenhuma geracao funciona, com um erro que fala de rede
# e esconde a causa.
#
#   ./mobile.sh            # sobe
#   ./mobile.sh parar      # derruba so o celular
#   ./mobile.sh status     # diz o que esta acontecendo
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd -P)"

LOG="${BENCH_MOBILE_LOG:-$HOME/mobile.log}"
PORTA="${BENCH_MOBILE_PORT:-5300}"
API_PORT="${PORT:-8787}"
ACAO="${1:-subir}"

em_uso() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

# Mesmo cuidado do stop.sh: casa o PROCESSO, nao quem fala dele, e so o que roda
# a partir DESTA pasta — senao o script derruba o proprio terminal, ou o Vite de
# outro projeto na mesma maquina.
pids_do_celular() {
  local pid cwd
  for pid in $(pgrep -f 'mobile/vite\.config\.js' 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [ -n "$cwd" ] || continue
    case "$cwd" in "$ROOT"|"$ROOT"/*) printf '%s\n' "$pid" ;; esac
  done
}

case "$ACAO" in
  status)
    printf '\n'
    if em_uso "$PORTA"; then
      printf '  celular: NO AR em :%s  (pids: %s)\n' "$PORTA" "$(pids_do_celular | tr '\n' ' ')"
      ss -tln 2>/dev/null | grep ":$PORTA" | grep -q '0.0.0.0' \
        && printf '  alcance: toda a rede — abra http://%s:%s no telefone\n' "$(hostname -I 2>/dev/null | awk '{print $1}')" "$PORTA" \
        || printf '  alcance: SO esta maquina (127.0.0.1) — o telefone nao vai abrir\n'
    else
      printf '  celular: parado\n'
    fi
    em_uso "$API_PORT" && printf '  API:     no ar em :%s\n\n' "$API_PORT" || printf '  API:     PARADA em :%s — sem ela o celular abre e nao gera nada\n\n' "$API_PORT"
    ;;

  parar)
    PIDS="$(pids_do_celular)"
    if [ -z "$PIDS" ]; then printf '\n  o celular nao estava rodando.\n\n'; exit 0; fi
    printf '\n  encerrando o celular: %s\n' "$(echo "$PIDS" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
    sleep 2
    RESTOU="$(pids_do_celular)"
    # shellcheck disable=SC2086
    [ -n "$RESTOU" ] && kill -9 $RESTOU 2>/dev/null || true
    printf '  encerrado. O estudio no computador continua no ar.\n\n'
    ;;

  subir)
    if em_uso "$PORTA"; then
      printf '\n  ja esta no ar em :%s. Use ./mobile.sh status\n\n' "$PORTA"
      exit 0
    fi
    if ! em_uso "$API_PORT"; then
      printf '\n  A API nao esta rodando (porta %s).\n' "$API_PORT"
      printf '  O celular ate abriria, mas nenhuma geracao funcionaria.\n'
      printf '  Suba tudo de uma vez:  ./start.sh --mobile\n\n'
      exit 1
    fi

    setsid nohup npm run mobile > "$LOG" 2>&1 < /dev/null &
    printf '\n  subindo… (log em %s)\n' "$LOG"
    for _ in $(seq 1 25); do
      sleep 1
      em_uso "$PORTA" && break
    done

    if em_uso "$PORTA"; then
      IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
      printf '  no ar.\n\n'
      printf '  No telefone:  http://%s:%s\n' "${IP:-<ip-desta-maquina>}" "$PORTA"
      if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | head -1 | grep -qi active; then
        ufw status 2>/dev/null | grep -q "^$PORTA/tcp" \
          || printf '  ATENCAO: o firewall nao libera a %s — de fora parece que nada responde.\n            sudo ufw allow %s/tcp\n' "$PORTA" "$PORTA"
      fi
      printf '\n'
    else
      printf '  NAO subiu. As ultimas linhas do log:\n\n'
      tail -20 "$LOG"
      printf '\n  Faltando a pasta mobile/ ou "Missing script: mobile"? A atualizacao nao\n'
      printf '  chegou nesta maquina: rode ./atualizar.sh\n\n'
      exit 1
    fi
    ;;

  *)
    printf '\n  uso: ./mobile.sh [subir|parar|status]\n\n'
    exit 1
    ;;
esac
