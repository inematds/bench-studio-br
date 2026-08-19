#!/usr/bin/env bash
# RESOLVER — "nao esta funcionando, e agora?"
#
# Confere as coisas que de fato quebram, na ordem em que costumam quebrar, e
# arruma o que da para arrumar sozinho. O que ele nao pode decidir por voce, ele
# nomeia com o comando exato.
#
# Todas as correcoes aqui sao seguras: instalar dependencia, subir o que estava
# parado, apagar lixo de execucao. Nada que apague trabalho seu, nada que mexa em
# firewall ou em chave sem voce mandar.
#
#   ./resolver.sh            # diagnostica e corrige o que for seguro
#   ./resolver.sh --so-ver   # so o diagnostico, nao toca em nada
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd -P)"

SO_VER=0
[ "${1:-}" = "--so-ver" ] && SO_VER=1

API_PORT="${PORT:-8787}"
WEB_PORT="${BENCH_WEB_PORT:-5200}"
MOBILE_PORT="${BENCH_MOBILE_PORT:-5300}"

ok()    { printf '  [ ok  ] %s\n' "$*"; }
nota()  { printf '  [ !   ] %s\n' "$*"; }
ruim()  { printf '  [FALHA] %s\n' "$*"; }
acao()  { printf '          -> %s\n' "$*"; }
em_uso() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

PROBLEMAS=0
printf '\n  Diagnostico do estudio — %s\n\n' "$(hostname)"

# 1. Node. E a falha que mais engana: sem versao suficiente o servidor morre e
#    so a interface sobe, entao TUDO parece problema de rede.
NODE_VER="$(node -v 2>/dev/null | sed 's/^v//' || echo 0)"
NODE_MAJOR="${NODE_VER%%.*}"
NODE_MINOR="$(printf '%s' "${NODE_VER#*.}" | cut -d. -f1)"
if [ "${NODE_MAJOR:-0}" -gt 22 ] || { [ "${NODE_MAJOR:-0}" -eq 22 ] && [ "${NODE_MINOR:-0}" -ge 5 ]; }; then
  ok "Node $NODE_VER"
else
  ruim "Node $NODE_VER — o banco usa node:sqlite, que so existe a partir do 22.5"
  acao "curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash - && sudo apt install -y nodejs && rm -rf node_modules && npm install"
  PROBLEMAS=$((PROBLEMAS+1))
  printf '\n  Sem resolver isto, nada mais adianta. Parando por aqui.\n\n'
  exit 1
fi

# 2. Dependencias.
if [ -d node_modules ]; then
  ok "dependencias instaladas"
else
  nota "node_modules ausente"
  if [ "$SO_VER" = "0" ]; then acao "instalando…"; npm install >/dev/null 2>&1 && ok "instaladas"; else acao "npm install"; fi
fi

# 3. Lixo que trava atualizacao.
if [ -f nohup.out ]; then
  nota "nohup.out (lixo de execucao) esta atrapalhando o git"
  if [ "$SO_VER" = "0" ]; then rm -f nohup.out; acao "apagado"; else acao "rm -f nohup.out"; fi
else
  ok "sem lixo de execucao"
fi

# 4. A API. Sem ela a tela abre e nada funciona — e o erro que aparece na tela
#    fala de rede, nao de servidor parado.
if em_uso "$API_PORT"; then
  ok "API respondendo na porta $API_PORT"
else
  ruim "API parada (porta $API_PORT) — a interface abre, mas nenhuma geracao funciona"
  PROBLEMAS=$((PROBLEMAS+1))
  if [ "$SO_VER" = "0" ]; then
    acao "subindo o estudio…"
    ./start.sh >/dev/null 2>&1 || true
    em_uso "$API_PORT" && ok "API no ar" || acao "nao subiu — veja: tail -30 ~/bench.log"
  else
    acao "./start.sh"
  fi
fi

# 5. As interfaces.
em_uso "$WEB_PORT" && ok "interface do computador na porta $WEB_PORT" || nota "interface do computador parada (porta $WEB_PORT) — ./start.sh"
if em_uso "$MOBILE_PORT"; then
  ok "interface de celular na porta $MOBILE_PORT"
else
  nota "interface de celular parada (porta $MOBILE_PORT)"
  acao "./start.sh --mobile   (sobe as duas)"
fi

# 6. Firewall: aqui NAO corrijo sozinho. Abrir porta e decisao de exposicao, e
#    quem decide isso e voce.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | head -1 | grep -qi active; then
  for p in "$WEB_PORT" "$MOBILE_PORT"; do
    if ufw status 2>/dev/null | grep -q "^$p/tcp"; then
      ok "firewall libera a porta $p"
    else
      nota "firewall NAO libera a porta $p — de fora, parece que nada responde"
      acao "sudo ufw allow $p/tcp"
    fi
  done
else
  ok "ufw inativo ou ausente (nada bloqueando por aqui)"
fi

# 7. Versao: arquivo x processo. Divergir aqui significa codigo novo no disco e
#    antigo na memoria — a origem classica de "a correcao nao funcionou".
DISCO="$(node -p "require('./package.json').version" 2>/dev/null || echo '?')"
MEMORIA="$(curl -s --max-time 4 "localhost:$API_PORT/api/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
if [ -z "$MEMORIA" ]; then
  nota "versao no disco: $DISCO (o processo nao respondeu — pode estar trancado por senha, o que e normal)"
elif [ "$DISCO" = "$MEMORIA" ]; then
  ok "versao $DISCO (disco e processo batem)"
else
  ruim "disco esta em $DISCO e o processo rodando esta em $MEMORIA"
  acao "./stop.sh && ./start.sh --mobile   (reiniciar faz o processo pegar o codigo novo)"
  PROBLEMAS=$((PROBLEMAS+1))
fi

# 8. Atualizacao pendente.
if [ -d .git ] && git fetch --quiet origin 2>/dev/null; then
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}' 2>/dev/null || echo HEAD)" ]; then
    ok "esta na ultima versao publicada"
  else
    nota "existe versao mais nova publicada"
    acao "./atualizar.sh"
  fi
fi

printf '\n'
if [ "$PROBLEMAS" = "0" ]; then
  printf '  Nada quebrado. Se ainda assim nao abre no navegador, confira que voce\n'
  printf '  esta acessando ESTA maquina (%s) e nao outra.\n\n' "$(hostname)"
else
  printf '  %s item(ns) precisam de atencao — veja as linhas com FALHA acima.\n\n' "$PROBLEMAS"
fi
