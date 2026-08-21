# O sandbox do motor Codex (bwrap)

## O sintoma

Uma build de Website ou Document falha em ~24% com uma mensagem que fala do
disco:

> Não foi possível criar `document.html`: o ambiente recusou todas as gravações
> no diretório do projeto, inclusive via patch direto.

A pasta do projeto está gravável o tempo todo. Quem recusou não foi o disco: foi
o **AppArmor**, que impediu o `bwrap` de criar o user namespace onde o Codex
trabalha. Sem namespace, o agente não consegue escrever nada — e o que sobra é
uma mensagem sobre escrita.

## A causa

O Ubuntu 24.04 transiciona todo processo que cria um user namespace sem
privilégio para o perfil `unprivileged_userns`, que começa com
`audit deny capability`. O `bwrap` precisa de capabilities dentro do namespace,
então morre antes de começar:

```
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
bwrap: setting up uid map: Permission denied
```

## A correção

```bash
cd app
./scripts/fix-sandbox.sh --check     # diagnostica: 0 = ok, 1 = bloqueado
sudo ./scripts/fix-sandbox.sh        # corrige e confere
```

O script grava um perfil AppArmor **só para o binário do bwrap**
(`/etc/apparmor.d/bwrap`) — o resto do sistema continua restrito — e, se o caso
for outro, religa `user.max_user_namespaces`. Persiste no reboot e não precisa
reiniciar o serviço: o perfil vale a partir do próximo `exec` do bwrap.

## Quando não há correção

Em VPS de virtualização por container (LXC, OpenVZ, Docker) quem nega o
namespace aninhado é o **host**, e nenhum comando de dentro muda isso. O script
detecta e diz. As saídas:

- construir com **Claude Code** (permissão própria, não usa bwrap) ou com
  **Qwen local via ollama** (o servidor grava os arquivos; nenhum sandbox entra
  na jogada) — os dois estão no seletor de motor;
- se você controla o host Docker, subir o container com
  `--security-opt apparmor=unconfined --security-opt seccomp=unconfined --cap-add SYS_ADMIN`;
- trocar por uma VPS de virtualização real (KVM).

Rodar o Codex com `sandboxMode: "danger-full-access"` resolveria o sintoma
removendo a contenção exatamente do processo que mais precisa dela — um agente
autônomo que escreve arquivos. É a pior das trocas, e por isso não está aqui.

## Por que isso não é aplicado sozinho no update

O `npm run doctor` roda em toda instalação (`./install.sh`, passo 4) e em todo
`./atualizar.sh`, e **avisa** quando o bwrap está bloqueado. Ele não corrige:
a correção exige root e reescreve política de segurança do sistema — coisa que
um atualizador de aplicação não deve fazer sem alguém digitar.
