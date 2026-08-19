#!/usr/bin/env bash
# INSTALAR — o mesmo que ./install.sh, com o nome em portugues.
#
# Os cinco verbos desta pasta: instalar, atualizar, start (--mobile), stop,
# resolver. Mais ./mobile.sh, quando so o celular interessa.
exec "$(dirname "$0")/install.sh" "$@"
