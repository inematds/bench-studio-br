# Acesso remoto e instalação em VPS

O que ficou decidido, por quê, e o que fazer na prática. Vale para VPS, para a
máquina do escritório vista de casa, e para qualquer caso em que o estúdio
precise ser alcançado de fora.

Versão de referência: **1.5.2** (este repositório).

---

## 1. O resumo, se você só quer o comando

Numa máquina nova que vai ser alcançada de fora, nesta ordem:

```bash
node -v                     # PRECISA ser 22.5+ — veja o passo 0 abaixo
git clone git@github.com:inematds/bench-studio-br.git
cd bench-studio-br
./instalar.sh               # dependências, .env e a conferência de requisitos
npm run set-password        # antes de abrir a porta, não depois
./scripts/remote.sh open    # publica a interface + regra de firewall
ufw allow 5300/tcp          # só se quiser a interface de celular alcançável
./start.sh --mobile         # sobe, espera as portas e diz o que respondeu
```

Ao terminar de trabalhar: `./stop.sh` (e `./scripts/remote.sh close` para
fechar a porta).

**Para atualizar, depois, é um comando só: `./atualizar.sh`.** Ele busca o código
novo ANTES de executar a lógica de atualização — a ordem importa, porque quem
roda a atualização é a cópia que está no disco, a antiga; sem inverter isso, uma
melhoria no atualizador só valeria da próxima vez. Ele também limpa sozinho o que
a máquina regrava e o `nohup.out`, reinstala dependências quando preciso,
reconstrói o que existir, confere requisitos e **reinicia devolvendo o que estava
no ar** — inclusive a interface de celular, se ela estava de pé.

**Quando algo não estiver funcionando: `./resolver.sh`.** Ele confere na ordem em
que as coisas quebram (Node, dependências, API parada, interfaces, firewall) e
termina comparando a versão do disco com a do processo em execução — divergência
ali é a causa clássica de "a correção não funcionou".

### Passo 0: a versão do Node, antes de tudo

Um Ubuntu recém-instalado costuma vir com Node 20, e nele **o servidor não sobe**
— o banco importa `node:sqlite`, que só existe a partir do 22.5. O sintoma é
cruel: o Vite sobe assim mesmo, a tela abre em `:5200`, e todo `/api/` responde
`ECONNREFUSED`, o que parece firewall ou proxy quando é versão.

Para levar o sistema ao Node 24, sem manter várias versões lado a lado:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node -v && npm -v
```

Esse caminho é o mais simples, mas **substitui** o Node do sistema. Se você
precisa de várias versões convivendo (outros projetos na mesma VPS), use o nvm:
`nvm install 24 && nvm use 24` — e leia a nota sobre `PATH` do systemd na seção
6, porque o Node do nvm não é encontrado por um serviço.

Se as dependências já tinham sido instaladas sob o Node velho, refaça:
`rm -rf node_modules && npm install`.

Desde a 1.6.4 o `npm run dev` recusa a subir em Node antigo e diz o que instalar,
em vez de morrer com um stack trace. Feito nesta VPS em 2026-08-18: era Node
20.20.0, foi para 24.19.0 por esse mesmo comando do NodeSource.

Ao terminar:

```bash
./scripts/remote.sh close
```

`./scripts/remote.sh status` responde a qualquer momento: aberto ou fechado, em
que porta, com ou sem senha, firewall ativo ou não.

### Antes de depurar: qual máquina, qual porta

A maior parte do tempo perdido numa VPS não é gasta com defeito. É gasta
depurando o servidor errado. Duas checagens, sempre primeiro:

```bash
hostname             # é esta a máquina que serve o estúdio?
curl -s ifconfig.me  # e é este o IP para onde o seu domínio aponta?
```

Com mais de um servidor, é perfeitamente possível atualizar um, reiniciar,
verificar — e estar olhando o outro no navegador o tempo inteiro. Confirme a
versão pelo **processo que está rodando**, nunca pelos arquivos:

```bash
curl -s localhost:8787/api/health
```

`authRequired` ali é o servidor funcionando, pedindo a senha que você definiu.

**Domínio que resolve para outra máquina não tira certificado.** O Let's Encrypt
valida batendo no IP que o nome resolve. Se `dig +short seu.dominio` não for
igual ao `curl -s ifconfig.me` da máquina do estúdio, o `production-nginx.sh`
falha no certbot, e não há flag que contorne. Arrume o registro A antes — ou
aponte um subdomínio novo para a máquina certa, o que não mexe em nada que já
funciona.

### A interface de celular não responde

Ela é um **processo separado** do desktop. Atualizar, reiniciar ou abrir o
desktop não diz nada sobre ela.

```bash
ss -tlnp | grep -E '5200|5300'   # a 5300 aparece? e em 0.0.0.0, não 127.0.0.1?
```

- **Nada na 5300** — ela nunca foi iniciada. `./start.sh --mobile` sobe as duas;
  o `npm run update` devolve o que já estava no ar, que não é a mesma coisa que
  iniciar algo pela primeira vez.
- **Na 5300 mas o celular não alcança** — firewall: `ufw allow 5300/tcp`.
- **Subiu e morreu** — o motivo está no log, e o jeito mais rápido de ler é
  rodar no primeiro plano, onde nada engole o erro:

```bash
npm run mobile 2>&1 | head -30
```

`Missing script: mobile`, ou pasta `mobile/` inexistente, significam a mesma
coisa: o pull não entrou. Rode `npm run update` e leia a saída até o fim — ele
para e nomeia os arquivos quando alguma alteração local seria atropelada.

Em produção atrás do nginx nada disso se aplica: o celular é servido em `/m` do
mesmo domínio e a porta 5300 não é usada.

---

## 2. Por que a senha vem antes da porta

Esta é a regra que organiza todo o resto:

> **A senha só pode ser definida na própria máquina.** Pela rede é 403 — mesmo
> com sessão válida, mesmo já logado com a senha certa.

`server/server.mjs` recusa `POST /api/config/password` de qualquer origem que não
seja loopback. O mesmo vale para gravar chave de provedor.

Não é descuido, é a proteção principal do modo aberto. O estúdio sobe **sem
senha** de propósito. Se a gravação fosse liberada pela rede, o primeiro estranho
que achasse a porta aberta poderia **definir uma senha e trancar o dono para
fora** — sem recuperação por e-mail, sem nada a fazer além de voltar ao SSH.
Do jeito atual, quem tem a máquina sempre ganha.

A consequência prática é a assimetria: **depois que a porta abre, ninguém do
outro lado consegue mais fechar essa brecha**. Por isso o momento de pôr a senha
é a instalação, e por isso o `remote.sh open` pergunta antes de abrir.

### O que o `open` faz com isso

```
!  No password: whoever reaches the address gets in — that is the default.
   Set a password now? [Y/n]
```

- `Y` → chama o `npm run set-password` de verdade (pergunta duas vezes, não
  ecoa, não passa por argumento nem pelo histórico do shell).
- `n`, Enter, ou **nenhum terminal** (pipe, CI, cron) → abre sem senha e avisa em
  vermelho. Não bloqueia — decisão consciente.

### Como trocar a senha depois

Sempre na máquina:

```bash
npm run set-password              # define ou substitui; vale na hora, sem restart
npm run set-password -- --remove  # remove
```

Esqueceu? Apague a linha `BENCH_PASSWORD` do `.env` e reinicie. É o caminho de
recuperação, de propósito: quem tem o arquivo já tem as chaves dentro dele.

---

## 3. O que o `remote.sh` faz, exatamente

Três verbos, um arquivo de estado.

| Comando | O que faz |
|---|---|
| `./scripts/remote.sh open` | oferece a senha, publica a interface, abre a porta no ufw, grava o estado |
| `./scripts/remote.sh close` | lê o estado e desfaz exatamente aquilo |
| `./scripts/remote.sh status` | aberto/fechado, porta, senha, firewall |

Flags:

```bash
./scripts/remote.sh open --ip 203.0.113.7   # só esse endereço, não a internet
./scripts/remote.sh open --firewall         # também liga o ufw (SSH liberado antes)
```

O que ele toca, e nada além disso:

- `.env` → `BENCH_WEB_HOST=0.0.0.0` e `BENCH_API_HOST=127.0.0.1`, com `chmod 600`
- `ufw` → `allow OpenSSH`, depois `allow <porta>/tcp`
- `data/remote.state` → porta, valor anterior de `BENCH_WEB_HOST`, se a regra foi
  criada, restrição de IP e o horário

Decisões dentro do script:

- **O `close` lê o estado, não chuta.** Ele desfaz o que aquele `open` fez, não
  o que um `open` genérico costuma fazer.
- **A regra de SSH é liberada antes de qualquer `ufw enable` e nunca é
  removida.** Remover essa regra é como as pessoas se trancam para fora do
  próprio servidor.
- **Idempotente.** Rodar duas vezes não quebra.
- **Ele avisa se a porta continua escutando** depois do `close` — é o processo
  antigo, que precisa de restart.
- **Ele não liga o firewall sozinho.** Se o ufw estiver instalado e inativo, ele
  diz isso e oferece o `--firewall`, em vez de mudar a política da máquina por
  conta própria.

---

## 4. A API nunca é publicada

Mudança de comportamento na 1.4.2: `app.listen(PORT)` virou
`app.listen(PORT, BENCH_API_HOST)`, com padrão `127.0.0.1`.

Antes, a API escutava em todas as interfaces. Publicar a interface publicava
junto a porta 8787 — que é a que grava arquivo, chama provedor e gasta dinheiro —
sem ninguém ter pedido. Agora só a interface (5200) vai para fora; a API atende a
interface, que roda na mesma máquina.

O opt-out consciente existe: `BENCH_API_HOST=0.0.0.0`. Tenha um motivo.

---

## 5. A tela de Config vista da rede

Ela é a mesma tela para quem está na máquina e para quem chega de fora — só que
em modo leitura, porque o servidor recusa a gravação de qualquer jeito. O aviso
de exposição deixou de mentir quando há senha; o resto da limpeza abaixo veio do
repositório irmão `bench-studio-en` e ainda **não** está toda aqui:

| Item | Aqui hoje |
|---|---|
| aviso de exposição | **corrigido**: sem senha, alerta vermelho; com senha, aviso informativo lembrando que o tráfego é HTTP puro |
| campo de senha desabilitado, sem dizer o que fazer | **pendente** — falta mostrar o comando que resolve e o motivo da trava |
| campos de chave desabilitados, sem explicação | **pendente** — falta "defina na máquina" + link do provedor |
| caminho absoluto do `.env` visível | **pendente** — deveria sumir em modo leitura; ele denuncia, entre outras coisas, se o processo roda como root |
| botão `Test` ativo pela rede | **pendente** — testar dispara chamada ao provedor: é ação, não leitura |
| botões de salvar cinzentos | **pendente** — deveriam sumir |

O que continua visível pela rede sem senha: quais provedores existem, se cada
chave está presente e seus 4 últimos caracteres. **Nunca o valor.**

---

## 6. Deixando no ar com segurança

Em ordem do que mais protege:

1. **Senha na instalação.** `npm run set-password` antes do `open`. Sem ela, a
   porta é a única barreira entre a internet e seus arquivos gerados.
2. **API em loopback.** É o padrão. `BENCH_API_HOST=0.0.0.0` é opt-out.
3. **Restringir quem alcança.** `remote.sh open --ip <seu-ip>` ganha de porta
   aberta. Tailscale ganha das duas, e não abre porta nenhuma.
4. **Firewall ligado.** `remote.sh open --firewall`. Confira **também** o painel
   de firewall do provedor da VPS: ele fica na frente do ufw e não obedece a
   ninguém dentro da máquina.
5. **HTTPS na frente.** Domínio apontado, nginx ou Caddy com Let's Encrypt
   servindo o `dist/` do `npm run build` e encaminhando `/api`, `/media`,
   `/previews`, `/inputs` e `/projects` para `127.0.0.1:8787`. Depois disso,
   feche a 5200 de vez.
6. **Usuário próprio, não root**, sob unidade systemd, com `.env` em `600` — que
   é como o estúdio já grava.
7. **Fechar quando o teste acabar.** `./scripts/remote.sh close`. A exposição
   esquecida é a que custa crédito de provedor.

### Atenção ao montar o nginx

A trava "só grava quem está na máquina" (`server/config_store.mjs`, `isLoopback`) aceita a
requisição quando o socket é loopback **e** o `X-Forwarded-For` também é local —
ou quando não há `X-Forwarded-For` nenhum.

Atrás de um proxy, quem abre o socket é o proxy, em 127.0.0.1. Se o nginx **não**
mandar `X-Forwarded-For`, todo mundo passa a parecer local e a gravação de chaves
fica aberta para a internet. O proxy do Vite manda (`xfwd: true` no
`vite.config.js`), por isso hoje funciona.

**Ao colocar nginx na frente, configure `proxy_set_header X-Forwarded-For`.**
Isto está registrado como pendência: o servidor deveria falhar fechado nesse
caso, em vez de depender da configuração do proxy estar certa.

---

## 7. Variáveis envolvidas

| Variável | Padrão | Para que serve |
|---|---|---|
| `BENCH_WEB_HOST` | `127.0.0.1` | em que interface a UI escuta. O `remote.sh` mexe nela; você não precisa |
| `BENCH_API_HOST` | `127.0.0.1` | em que interface a API escuta. Mudar isto é publicar a API |
| `BENCH_WEB_PORT` | `5200` | porta da interface |
| `PORT` / `BENCH_API_PORT` | `8787` | porta da API |
| `BENCH_PASSWORD` | vazio | hash scrypt da senha. Não edite na mão: use `npm run set-password` |

Ordem de leitura: exportado no shell > `.env` do projeto > `~/.env`.

---

## 8. O que ficou em aberto

Três coisas conhecidas, nenhuma delas bloqueia o uso:

1. **`isLoopback` atrás de proxy reverso** — descrito na seção 6. Só morde com
   nginx/Caddy na frente. A correção seria falhar fechado (exigir o cabeçalho
   explícito quando o estúdio está exposto), em vez de confiar na configuração
   do proxy.
2. **A tela de Config em modo leitura ainda está pela metade** — ver a tabela da
   seção 5: campos desabilitados sem explicação, caminho do `.env` à mostra e
   botão `Test` ativo pela rede.
3. **O e2e depende de `FAL_KEY`.** Dois testes falham em máquina sem chave:
   `e2e.spec.mjs:71` procura no seletor um modelo da fal que não aparece sem
   chave, e `e2e.spec.mjs:195` compara um snapshot cuja barra de controles mostra
   outro modelo default. São 4 falhas contando desktop e mobile. Consequência:
   `npm run test:release` não passa para quem clona o repo sem chave. A correção
   de verdade é fixar um registry de teste, em vez de depender do que está
   disponível na máquina.

---

## Histórico

Este repositório recebeu `scripts/remote.sh`, a API em loopback por padrão
(`BENCH_API_HOST`), as seções de acesso remoto no README e o aviso de exposição
que reconhece a senha. A limpeza completa da tela de Config em modo leitura
(seção 5) veio depois no `bench-studio-en` e ainda não foi portada.

Detalhe por versão no [CHANGELOG.md](../CHANGELOG.md).
