#!/usr/bin/env bash
# Instalacao em uma maquina nova, do zero, na ordem que importa.
#
# Nao inventa nada: e o passo a passo do README executado por um arquivo so, com
# as verificacoes no meio em vez de no fim. Para de proposito quando um requisito
# falha — foi o contrario disso que fez uma VPS passar por instalada e so revelar
# o problema depois, com a interface no ar e todo /api/ recusando conexao.
set -euo pipefail
cd "$(dirname "$0")"

NODE_MIN_MAJOR=22
NODE_MIN_MINOR=5
diga() { printf '\n  %s\n' "$*"; }
morra() { printf '\n  %s\n\n' "$*" >&2; exit 1; }

diga "1/5  Node"
command -v node >/dev/null 2>&1 || morra "Node nao esta instalado. Veja o passo 0 do README."
NODE_VER="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VER%%.*}"
NODE_RESTO="${NODE_VER#*.}"
NODE_MINOR="${NODE_RESTO%%.*}"
if [ "$NODE_MAJOR" -lt "$NODE_MIN_MAJOR" ] || { [ "$NODE_MAJOR" -eq "$NODE_MIN_MAJOR" ] && [ "$NODE_MINOR" -lt "$NODE_MIN_MINOR" ]; }; then
  cat >&2 <<EOF

  Node $NODE_VER e antigo demais. E preciso $NODE_MIN_MAJOR.$NODE_MIN_MINOR ou
  mais novo: o banco usa o modulo interno node:sqlite, que so existe a partir
  dessa versao. Em Node antigo o servidor morre e SO a interface sobe, o que
  aparece como todo /api/ recusando conexao.

  Ubuntu/Debian, substituindo o Node do sistema:
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
    sudo apt install -y nodejs

  Mantendo varias versoes lado a lado:
    nvm install 24 && nvm use 24

  Depois rode este script de novo.

EOF
  exit 1
fi
diga "     Node $NODE_VER, ok."

diga "2/5  Dependencias"
npm install

diga "3/5  Credenciais"
if [ -f .env ]; then
  diga "     .env ja existe, mantido como esta."
else
  cp .env.example .env
  diga "     .env criado a partir do exemplo. Preencha as chaves que voce tem e"
  diga "     APAGUE as linhas das que nao tem — chave declarada vazia falha como"
  diga "     credencial invalida e manda voce procurar o problema no lugar errado."
fi

diga "4/5  Requisitos"
npm run doctor

diga "5/5  Pronto"
cat <<EOF

  Para uso local (so esta maquina):
    ./start.sh

  Para deixar alcancavel de fora, antes de subir:
    npm run set-password        # a senha vem ANTES da porta abrir
    ./scripts/remote.sh open
    ./start.sh

  Depois: ./stop.sh encerra, e npm run update atualiza.

EOF
