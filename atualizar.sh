#!/usr/bin/env bash
# ATUALIZAR — o verbo unico para deixar esta maquina em dia.
#
# Ele existe por causa de um problema que o `npm run update` sozinho nao resolve:
# quem roda a atualizacao e o script que esta NO DISCO, ou seja, a versao ANTIGA.
# Uma melhoria feita no atualizador so vale a partir da proxima vez — e foi assim
# que uma VPS atualizou os arquivos e nao reiniciou, porque a versao instalada
# ali ainda nao sabia reiniciar.
#
# Aqui a ordem e invertida de proposito: primeiro busca o codigo novo, depois
# executa a logica JA ATUALIZADA. Uma passada, sem surpresa.
#
#   ./atualizar.sh              # atualiza e reinicia o que estiver no ar
#   ./atualizar.sh --sem-reinicio
set -euo pipefail
cd "$(dirname "$0")"

diga() { printf '\n  %s\n' "$*"; }
morra() { printf '\n  %s\n\n' "$*" >&2; exit 1; }

# Arquivos que a propria maquina reescreve, e lixo de execucao: nada disso e
# trabalho humano, e todos travam o `git pull` com "local changes would be
# overwritten" — a mensagem que mais assusta quem so quer atualizar.
DESCARTAVEIS="package-lock.json server/providers/kie.models.json"

[ -d .git ] || morra "Esta pasta nao e um clone git. Reinstale com ./instalar.sh"

diga "1/3  limpando o que a maquina regrava sozinha"
for f in $DESCARTAVEIS; do
  git checkout -- "$f" 2>/dev/null || true
done
rm -f nohup.out
# Alteracao de verdade interrompe: melhor parar do que atropelar o trabalho de
# alguem. `dist` e `node_modules` nao contam — o proprio update os reconstroi.
PENDENTE="$(git status --porcelain | awk '{print $2}' | grep -vE '^(package-lock\.json|server/providers/kie\.models\.json|dist/|dist-mobile/|node_modules/|nohup\.out)$' || true)"
if [ -n "$PENDENTE" ]; then
  printf '\n  Esta maquina tem alteracoes que eu nao vou sobrescrever:\n'
  printf '    %s\n' $PENDENTE
  printf '\n  Se voce nao mexeu nesses arquivos de proposito, descarte com:\n'
  printf '    git checkout -- %s\n' "$(echo $PENDENTE | tr '\n' ' ')"
  printf '  Se mexeu, guarde antes:  git stash\n\n'
  exit 1
fi
printf '     ok\n'

diga "2/3  buscando a versao nova"
git fetch --quiet origin
ANTES="$(git rev-parse HEAD)"
if [ "$ANTES" = "$(git rev-parse '@{u}')" ]; then
  printf '     ja estava na ultima versao\n'
else
  git merge --ff-only '@{u}' --quiet
  printf '     %s\n' "$(git log --oneline -1)"
fi

diga "3/3  aplicando"
# A partir daqui quem manda e o codigo RECEM-BAIXADO: instala dependencias,
# reconstroi o que precisa, confere requisitos e reinicia o que estava no ar.
if [ "${1:-}" = "--sem-reinicio" ]; then
  npm run update -- --no-restart
else
  npm run update
fi
