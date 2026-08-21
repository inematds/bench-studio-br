#!/usr/bin/env bash
# Bench Studio — libera o sandbox do Codex (bwrap) nesta maquina.
#
# Existe por causa de uma build que falhou sem dizer o motivo real: o Codex
# tentou gravar `document.html`, o bwrap morreu antes de criar o namespace, e a
# interface so mostrou "o ambiente recusou todas as gravacoes no diretorio do
# projeto". O disco estava gravavel o tempo todo — quem recusou foi o AppArmor.
#
# O Ubuntu 24.04 joga todo processo que cria user namespace sem privilegio no
# perfil `unprivileged_userns`, que comeca com `audit deny capability`. O bwrap
# precisa de capabilities dentro do namespace, entao morre. A correcao e um
# perfil AppArmor so para o binario do bwrap — o resto do sistema continua
# restrito.
#
#   sudo ./scripts/fix-sandbox.sh          # diagnostica e corrige
#   ./scripts/fix-sandbox.sh --check       # so diagnostica (0 = ok, 1 = quebrado)
#   ./scripts/fix-sandbox.sh --print       # mostra o perfil, nao grava nada
#
# Os motores `claude` e `ollama` NAO passam por aqui: nao usam bwrap e funcionam
# mesmo com o sandbox bloqueado. Isto vale so para o motor `codex`.
set -euo pipefail

ACTION="fix"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) ACTION="check"; shift ;;
    --print) ACTION="print"; shift ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'opcao desconhecida: %s\n' "$1" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mx  %s\033[0m\n' "$*" >&2; exit 1; }

BWRAP="$(command -v bwrap || true)"

# A prova real: se este comando passa, o Codex constroi. Qualquer outra
# checagem e palpite sobre o motivo de ele nao passar.
probe() { [ -n "$BWRAP" ] && "$BWRAP" --dev-bind / / --unshare-net true >/dev/null 2>&1; }

perfil() {
  cat <<EOF
abi <abi/4.0>,
include <tunables/global>

profile bwrap ${BWRAP} flags=(unconfined) {
  userns,

  # Necessario para o proprio perfil poder ser substituido/atualizado.
  include if exists <local/bwrap>
}
EOF
}

if [ "$ACTION" = "print" ]; then
  [ -n "$BWRAP" ] || die "bwrap nao esta instalado (apt install -y bubblewrap)."
  perfil
  exit 0
fi

# ------------------------------------------------------------- diagnostico

# `systemd-detect-virt` sai com codigo 1 quando NAO ha virtualizacao, e ainda
# assim imprime "none" — um `|| echo desconhecido` aqui concatena as duas coisas.
VIRT="$(systemd-detect-virt 2>/dev/null || true)"
[ -n "$VIRT" ] || VIRT="desconhecido"
USERNS_MAX="$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo '?')"
APPARMOR_RESTR="$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 'nao-existe')"

if [ -z "$BWRAP" ]; then
  if [ "$ACTION" = "check" ]; then
    printf 'bwrap: ausente\n'; exit 1
  fi
  die "bwrap nao esta instalado. Instale e rode de novo:  apt install -y bubblewrap"
fi

if probe; then
  printf 'bwrap: ok (%s)\n' "$BWRAP"
  [ "$ACTION" = "check" ] && exit 0
  info "nada a fazer — o sandbox ja funciona."
  exit 0
fi

if [ "$ACTION" = "check" ]; then
  printf 'bwrap: BLOQUEADO — o motor codex nao consegue gravar arquivo nenhum\n'
  printf '  virt=%s  apparmor_restrict_userns=%s  max_user_namespaces=%s\n' "$VIRT" "$APPARMOR_RESTR" "$USERNS_MAX"
  printf '  corrija com:  sudo ./scripts/fix-sandbox.sh\n'
  exit 1
fi

bold "sandbox bloqueado"
info "virt=$VIRT  apparmor_restrict_userns=$APPARMOR_RESTR  max_user_namespaces=$USERNS_MAX"

# Container de VPS barata (LXC/OpenVZ) nao tem conserto por dentro: quem nega o
# namespace aninhado e o host, e o host nao e seu. Dizer isso agora poupa a
# pessoa de rodar comando de root que nao vai mudar nada.
case "$VIRT" in
  lxc|lxc-libvirt|openvz|docker|podman|wsl)
    warn "esta maquina e um container ($VIRT) — o user namespace e negado pelo HOST."
    cat <<'EOF'

   Nao ha comando aqui dentro que resolva. As saidas reais:

     1. Trocar o motor da build para "Claude Code" ou "Qwen local (ollama)":
        nenhum dos dois usa bwrap, e ambos gravam os arquivos normalmente.

     2. Se voce controla o host Docker, subir o container com:
        --security-opt apparmor=unconfined --security-opt seccomp=unconfined --cap-add SYS_ADMIN

     3. Trocar por uma VPS de virtualizacao real (KVM) e rodar este script la.

EOF
    exit 1 ;;
esac

# ------------------------------------------------------------- correcao

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "rode como root: as duas correcoes gravam em /etc."
  SUDO="sudo"
fi

APLICOU=0

# Caso A — AppArmor restringindo (Ubuntu 24.04 e derivados). O sysctl so existe
# onde a restricao existe; em Debian/22.04 ele nem aparece e nao ha o que fazer
# por aqui.
if [ "$APPARMOR_RESTR" = "1" ]; then
  command -v apparmor_parser >/dev/null 2>&1 || die "apparmor_parser ausente (apt install -y apparmor-utils)."
  bold "1  perfil AppArmor para $BWRAP"
  perfil | $SUDO tee /etc/apparmor.d/bwrap >/dev/null
  # Perfil que nao compila e pior que perfil nenhum: o arquivo fica no disco e
  # volta a ser carregado no boot, entao o erro reaparece longe daqui.
  if ! $SUDO apparmor_parser -r /etc/apparmor.d/bwrap; then
    $SUDO rm -f /etc/apparmor.d/bwrap
    die "o perfil nao compilou (abi 4.0 pode nao existir neste AppArmor). Arquivo removido, nada mudou."
  fi
  info "gravado em /etc/apparmor.d/bwrap — persiste no reboot"
  APLICOU=1
fi

# Caso B — user namespace desligado no kernel.
if [ "$USERNS_MAX" = "0" ]; then
  bold "2  reabilitando user namespaces"
  echo 'user.max_user_namespaces=15000' | $SUDO tee /etc/sysctl.d/60-userns.conf >/dev/null
  $SUDO sysctl --system >/dev/null
  info "gravado em /etc/sysctl.d/60-userns.conf — persiste no reboot"
  APLICOU=1
fi

if [ "$APLICOU" -eq 0 ]; then
  warn "o bwrap falha, mas nao por AppArmor nem por userns desligado."
  info "veja a mensagem crua para saber o que e:"
  info "  $BWRAP --dev-bind / / --unshare-net true"
  exit 1
fi

# Nada disso vale se a prova nao passar. O perfil pega no proximo exec do bwrap,
# entao da para conferir agora mesmo — nao e preciso reiniciar o servico.
bold "conferindo"
if probe; then
  info "bwrap OK — o motor codex ja pode construir."
  exit 0
fi
die "ainda bloqueado. Mensagem crua:  $BWRAP --dev-bind / / --unshare-net true"
