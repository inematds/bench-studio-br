#!/usr/bin/env bash
# Degrau 2, parte 1 de 2: troca o Vite de desenvolvimento por um artefato fixo.
#
# O que muda de verdade: `npm run dev` mantem um servidor de DESENVOLVIMENTO
# aberto na rede — websocket de recarga viva, fontes sem minificar, tudo servido
# modulo a modulo. Depois deste script, quem responde e um `dist/` construido, e
# o Node passa a rodar SO a API (`npm run server`).
#
# Atencao a consequencia: o Express nao serve o `dist/`. Ele serve /media,
# /inputs, /previews e /projects, e mais nada. Sem um nginx na frente, depois
# deste script a interface FICA FORA DO AR — por isso a parte 2 existe, e por
# isso este script termina apontando para ela.
#
#   ./scripts/production-build.sh            # constroi e troca a unit para build
#   ./scripts/production-build.sh --build-only   # so constroi, nao mexe no servico
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

NAME="bench-studio"
BUILD_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="${2:?--name precisa de um valor}"; shift 2 ;;
    --build-only) BUILD_ONLY=1; shift ;;
    *) printf 'opcao desconhecida: %s\n' "$1" >&2; exit 1 ;;
  esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mx  %s\033[0m\n\n' "$*" >&2; exit 1; }

bold "1/3  requisitos"
npm run doctor >/dev/null || die "o doctor reprovou. Rode 'npm run doctor' e resolva antes."
printf '     ok\n'

bold "2/3  construindo as interfaces"
npm run build
[ -f dist/index.html ] || die "a build terminou sem dist/index.html."
printf '     dist/ pronto (%s)\n' "$(du -sh dist | cut -f1)"

# O celular e servido em /m/ pelo nginx, nao na raiz: sem a base os arquivos
# gerados apontariam para /assets/... — que pertence ao desktop — e a pagina
# abriria em branco, sem erro nenhum no log.
BENCH_MOBILE_BASE="${BENCH_MOBILE_BASE:-/m/}" npm run build:mobile
[ -f dist-mobile/index.html ] || die "a build do celular terminou sem dist-mobile/index.html."
printf '     dist-mobile/ pronto (%s), servido em %s\n' "$(du -sh dist-mobile | cut -f1)" "${BENCH_MOBILE_BASE:-/m/}"

if [ "$BUILD_ONLY" = "1" ]; then
  bold "pronto (apenas build)"
  printf '  O servico nao foi tocado. Para servir este dist/, veja:\n'
  printf '    ./scripts/production-nginx.sh --domain seu.dominio.com\n\n'
  exit 0
fi

bold "3/3  servico"
if ! command -v systemctl >/dev/null 2>&1; then
  warn "systemd nao encontrado: pulando a troca do servico."
  warn "suba a API na mao com 'npm run server' e siga para a parte 2."
else
  ./scripts/install-service.sh --name "$NAME" --serve build
  sleep 3
  API_PORT="${PORT:-8787}"
  if curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1 \
    || curl -s "http://127.0.0.1:${API_PORT}/api/health" | grep -q authRequired; then
    printf '     API respondendo em 127.0.0.1:%s\n' "$API_PORT"
  else
    warn "a API ainda nao respondeu em 127.0.0.1:${API_PORT}."
    warn "veja o motivo com: journalctl -u ${NAME} -n 40 --no-pager"
  fi
fi

cat <<EOF

  A interface agora e um arquivo, nao um servidor de desenvolvimento.
  ENQUANTO NAO HOUVER NGINX NA FRENTE, ela nao responde em lugar nenhum.
  O mesmo vale para a interface de celular, que ficara em /m/.

  Parte 2, o nginx:
    ./scripts/production-nginx.sh --domain seu.dominio.com --email voce@dominio.com

  Depois de CADA atualizacao, reconstrua — senao o navegador continua
  recebendo o pacote antigo:
    npm run update && ./scripts/production-build.sh

  Para voltar ao modo anterior (Vite servindo a interface):
    ./scripts/install-service.sh --serve dev

EOF
