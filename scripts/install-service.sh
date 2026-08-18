#!/usr/bin/env bash
# Bench Studio — instala (ou atualiza) a unit do systemd que mantem o estudio
# no ar: sobe no boot e volta sozinho se morrer.
#
# Existe porque "reinicie o servico" so faz sentido depois que alguem criou o
# servico, e o projeto nao criava nenhum: `systemctl restart bench-studio`
# respondia "Unit not found" e a instalacao parava ali.
#
#   ./scripts/install-service.sh                 # instala e liga
#   ./scripts/install-service.sh --name estudio  # outro nome de unit
#   ./scripts/install-service.sh --serve build   # nginx na frente, so a API aqui
#   ./scripts/install-service.sh --print         # so mostra a unit, nao grava
#   ./scripts/install-service.sh --remove        # desliga e apaga
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="bench-studio"
MODE="dev"          # dev = servidor + interface (o caso comum) | build = so a API
ACTION="install"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mx  %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --name)   NAME="${2:?--name precisa de um valor}"; shift 2 ;;
    --serve)  MODE="${2:?--serve precisa ser dev ou build}"; shift 2 ;;
    --print)  ACTION="print"; shift ;;
    --remove) ACTION="remove"; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "opcao desconhecida: $1" ;;
  esac
done

[ "$MODE" = "dev" ] || [ "$MODE" = "build" ] || die "--serve aceita 'dev' ou 'build'"

command -v systemctl >/dev/null 2>&1 || die "systemd nao encontrado nesta maquina."

UNIT_PATH="/etc/systemd/system/${NAME}.service"
# `sudo` so quando ele existe e nao somos root — em container costuma nao haver.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "rode como root ou instale o sudo."
  SUDO="sudo"
fi

if [ "$ACTION" = "remove" ]; then
  $SUDO systemctl disable --now "$NAME" 2>/dev/null || true
  $SUDO rm -f "$UNIT_PATH"
  $SUDO systemctl daemon-reload
  bold "removido: $UNIT_PATH"
  exit 0
fi

# O PATH do systemd e minimo e nao inclui nvm/fnm/volta. Sem congelar o
# diretorio do node aqui, a unit sobe e morre com "npm: command not found" —
# num lugar onde o erro so aparece no journal.
NPM_BIN="$(command -v npm || true)"
[ -n "$NPM_BIN" ] || die "npm nao encontrado no PATH."
NODE_DIR="$(dirname "$(command -v node)")"

# Quem roda: o dono do repositorio, nao quem digitou o comando. Instalar com
# sudo nao deveria transformar o estudio num processo de root.
RUN_USER="$(stat -c '%U' "$ROOT")"
[ -n "$RUN_USER" ] || RUN_USER="${SUDO_USER:-$USER}"

if [ "$MODE" = "dev" ]; then
  EXEC="$NPM_BIN run dev"
  NOTA="servidor + interface (Vite). E o caso comum."
else
  EXEC="$NPM_BIN run server"
  NOTA="so a API. Use quando nginx/Caddy servir o dist/ do 'npm run build'."
fi

UNIT="[Unit]
Description=Bench Studio
Documentation=https://github.com/inematds/bench-studio-br
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${ROOT}
Environment=PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=${EXEC}
Restart=on-failure
RestartSec=5
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
"

if [ "$ACTION" = "print" ]; then
  printf '%s' "$UNIT"
  exit 0
fi

bold "instalando ${NAME}.service"
echo "   pasta:   $ROOT"
echo "   usuario: $RUN_USER"
echo "   comando: $EXEC"
echo "   modo:    $MODE — $NOTA"

[ "$RUN_USER" = "root" ] && warn "o repositorio pertence a root: o estudio vai rodar como root, que e a postura que o README pede para nao manter."

printf '%s' "$UNIT" | $SUDO tee "$UNIT_PATH" >/dev/null
$SUDO systemctl daemon-reload

# Processo solto na mao segura a porta e faz a unit falhar por "address in
# use" — um erro que parece problema do systemd e nao e.
if pgrep -f "$ROOT/node_modules/.bin/vite|server/server.mjs" >/dev/null 2>&1; then
  warn "havia processo solto segurando a porta; derrubando antes de subir pelo systemd"
  pkill -f "server/server.mjs" 2>/dev/null || true
  pkill -f "$ROOT/node_modules/.bin/vite" 2>/dev/null || true
  sleep 2
fi

$SUDO systemctl enable --now "$NAME"
sleep 3
$SUDO systemctl status "$NAME" --no-pager --lines 5 || true

echo
bold "pronto"
echo "   reiniciar:  ${SUDO} systemctl restart $NAME"
echo "   logs:       ${SUDO} journalctl -u $NAME -f"
echo "   parar:      ${SUDO} systemctl stop $NAME"
echo "   remover:    ./scripts/install-service.sh --remove --name $NAME"
