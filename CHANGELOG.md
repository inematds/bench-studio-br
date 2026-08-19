# Changelog

Versionamento `X.XX.YY`: dentro do mesmo major, o `YY` nunca volta a zero —
correção incrementa `YY`, mudança de comportamento incrementa `XX` carregando o
`YY`, e só a virada de major zera o resto.

## 1.9.6

### Novo
- **Código da raia no chip do modelo, com `K` quando há quadro inicial/final.**
  `t2i`, `i2i`, `t2v`, `i2v`, `r2v` — e **`i2vK`** quando o modelo trabalha por
  keyframe. Antes essa informação só existia como frase ("várias imagens de
  referência"), que ocupava o chip inteiro, não dizia se havia keyframe, e sumia
  assim que o modelo era escolhido. Agora aparece na lista e continua no chip
  depois de selecionado.

### Corrigido
- **O nome do modelo sumia do chip.** Ele era o único filho encolhível: faltando
  espaço, ia a zero e o chip exibia provedor, capacidade e tipo — tudo menos
  qual modelo estava escolhido. Quem cede espaço primeiro passa a ser a frase de
  capacidade, e o nome ganhou um piso.
- **O botão de ampliar do vídeo cobria a etiqueta de custo.** Os dois moravam no
  canto superior direito; o de ampliar desceu para a coluna da esquerda.
- **A tela cheia abria presa dentro da coluna de resultados.** Um ancestral com
  filtro vira bloco de contenção e o `position: fixed` passa a se medir por ele.
  Agora ela vai para o `body` por portal, como o seletor de modelos já fazia.

## 1.8.6

### Novo
- **`install.sh`, `start.sh` e `stop.sh` na raiz.** O caminho comum em três
  verbos. O install para no requisito que falta em vez de deixar você com uma
  interface que abre e não responde; o start sobe destacado, espera a porta e
  mostra o `/api/health` (avisando que `authRequired` é o servidor funcionando);
  o stop encerra servidor e interface pelo padrão do comando, filtrando pelo
  diretório do projeto para não derrubar outro Node da máquina. README ganhou a
  seção **Quick install**.

### Mudou
- **Gerar e Refinar agora são dois botões.** Era um só, que dizia "Refinar
  prompt" e virava "Gerar" depois de refinar — então o único caminho visível
  para gerar passava pelo refinamento. Gerar direto já existia, mas só pelo
  Ctrl+Enter, que ninguém adivinha. Gerar é o primário; refinar virou escolha.
  A tecla Enter continua refinando, de propósito: transformar um hábito em
  gasto de crédito seria uma armadilha cara.
- **Clicar no resultado abre em tela cheia.** Antes o clique não fazia nada e a
  única forma de ver grande era baixar o arquivo ou abrir a cópia do provedor.
  Vídeo ganhou um botão de ampliar, porque o clique no quadro cai nos controles
  nativos. Fecha no Esc ou clicando fora.

### Corrigido
- **O card de vídeo saía torto no mural.** O elemento não declara proporção
  nenhuma até o navegador ler os metadados: desenhava na caixa padrão 300x150,
  o `object-fit: cover` cortava o quadro e o `min-height` deixava faixa preta.
  Agora a proporção real do arquivo é aplicada assim que os metadados chegam.
- **"Abrir a cópia hospedada na fal" aparecia para qualquer provedor**, inclusive
  quando o arquivo estava na Agnes, na kie ou na Kling. O texto passa a nomear o
  provedor real do resultado.

## 1.7.6

### Corrigido
- **O `update` parava pedindo decisão sobre um arquivo que ele mesmo deveria
  descartar.** A saída do `git status --porcelain` era aparada inteira, o que
  comia o espaço inicial da primeira linha: o caminho voltava como
  `erver/providers/kie.models.json` e deixava de casar com a lista de arquivos
  que a máquina regrava. O `doctor` tinha o mesmo defeito, exibindo
  `ackage.json`. Agora quem lê a saída é que apara o que precisa.

## 1.7.5

### Novo
- **`npm run doctor` — os requisitos conferidos antes de culpar a rede.** Node,
  npm, git, `node_modules`, `.env` (inclusive chaves declaradas mas vazias, que
  falham como "credencial inválida" e mandam procurar no lugar errado),
  permissão de escrita, as duas portas e o estado do repositório. Cada item
  responde o que se esperava, o que se achou e o comando que resolve. Sai com
  código 1 quando algo impede o estúdio de subir; avisos não travam nada. Não
  escreve nada e nunca imprime valor de chave, só presença.
- **`npm run update` — a atualização sem os tropeços conhecidos.** Descarta os
  dois arquivos que a própria máquina reescreve (`kie.models.json` no boot,
  `package-lock.json` no install), avança só em fast-forward, reinstala
  dependências apenas quando `package.json` mudou, roda o `doctor` no fim e diz
  como reiniciar. Qualquer outra alteração local **interrompe** o update e é
  mostrada, em vez de atropelada.

### Documentação
- **As duas instalações viraram passo a passo numerado, com verificação em cada
  ponto.** A da VPS começa no passo 0 (a versão do Node, com o caminho do
  NodeSource e a alternativa do nvm) e termina com quatro checagens: `remote.sh
  status`, `ss` mostrando `0.0.0.0:5200`, o `/api/health` e a contagem de linhas
  `[server]` no log. O README explica que `authRequired` é o servidor
  funcionando, e que zero linha `[server]` é o servidor que nunca subiu.
- A seção de atualização passa a ser um comando só, com o equivalente manual ao
  lado para quem quiser ver cada passo.

## 1.6.5

### Documentação
- **A versão do Node virou passo 0 da instalação, e ganhou um capítulo de
  diagnóstico.** O README agora mostra como levar um Ubuntu ao Node 24 pelo
  NodeSource (e a alternativa com nvm, quando é preciso manter versões lado a
  lado), lembra de refazer `node_modules` depois da troca, e traz a seção
  "quando a interface abre mas nada carrega" — o `ECONNREFUSED` em massa que
  parece rede e é versão. O runbook de VPS ganhou o mesmo passo 0, com a nota de
  que o Node do nvm não é encontrado por um serviço do systemd sem ajustar o
  `PATH`. A tabela de sintomas cobre ainda o `authRequired` (que é o servidor
  funcionando), o `git pull` travado pelos dois arquivos que a máquina regrava
  sozinha, e a porta fechada por falta de regra de firewall.

## 1.6.4

### Corrigido
- **Node antigo agora falha explicando, em vez de matar o servidor calado.** Em
  uma VPS com Node 20 o servidor saía com código 1 num
  `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` — o banco usa esse módulo interno,
  que só existe a partir do Node 22.5. Como só o Vite subia, a tela abria e toda
  chamada `/api/` dava `ECONNREFUSED`: o sintoma parecia rede ou proxy, e a
  causa era versão. Agora `npm run dev` e `npm run server` passam antes por um
  `server/preflight_node.mjs`, que confere a versão e imprime o que instalar
  (apt ou nvm). A checagem mora num arquivo separado de propósito: import de ESM
  é resolvido antes de qualquer linha rodar, então uma verificação dentro do
  próprio `server.mjs` nunca chegaria a executar. O `package.json` também passa
  a declarar `engines`.

## 1.6.3

### Mudou
- **A confirmação de troca de raia virou um diálogo do app.** Na 1.6.2 ela usava
  `window.confirm`, que desenha uma caixa clara do navegador no meio de uma
  interface escura — e que o usuário pode suprimir no próprio navegador, o que
  faria a troca voltar a ser silenciosa. Agora é um `ConfirmDialog` com os
  tokens do app: fecha no Esc, no clique fora e no botão de cancelar, confirma
  no Enter, e o botão de confirmar recebe o foco ao abrir.

## 1.6.2

Duas correções no caminho da imagem de referência: uma que impedia usar
referência sem chave do fal, outra que trocava o modelo sem avisar.

### Corrigido
- **Imagem para imagem funciona sem `FAL_KEY`.** A rota `/api/upload` chamava o
  storage do fal para QUALQUER provider. Texto para imagem passava porque não
  sobe arquivo; imagem para imagem morria com "fal rejected the current API
  credentials" — a mesma mensagem de chave inválida, mesmo quando a chave
  simplesmente não existia. O upload remoto virou opcional: sem chave (ou se ele
  falhar) a referência canônica é a cópia local em `/inputs/`, que o
  `resolveAssetForProvider` já entrega no formato de cada provider — caminho
  local para o CLI do Kling, base64 para a Agnes.

### Mudou
- **Anexar imagem em modelo texto para X pergunta antes de trocar de raia.** O
  atalho continua: o app oferece o modelo irmão que aceita referência. Mas a
  troca era silenciosa — o modelo mudava sem o usuário mandar e ele só descobria
  depois, no rodapé. Agora confirma. A aprovação vale para o lote inteiro de
  arquivos do mesmo clique e é zerada quando o modelo é escolhido na mão.

## 1.5.2

Vinte e três commits desde a 1.4.2. O fio que atravessa quase todos: a interface
declarava menos do que o servidor já sabia, e o que não era declarado falhava
tarde — no meio da geração, com mensagem genérica.

### Novo
- **Quadro inicial e final como dois seletores nomeados e numerados.** Modelo que
  aceita primeiro e último quadro para de receber uma lista anônima onde a ordem
  de anexo decidia o papel de cada imagem. Dez rotas hoje, incluindo as do Kling
  pela rota própria.
- **Capacidade de referência à vista.** Cada modelo anuncia o que aceita antes de
  você anexar: *1 imagem*, *até 10*, *quadro inicial + final*. Sai do schema do
  endpoint, não de lista escrita à mão.
- **Filtro por provedor no seletor de modelo**, e a lista abre rolada até o
  modelo em uso, não no topo.
- **Modos de fábrica editáveis.** Os sete deixaram de ser vitrine: dá para
  editar, esconder e restaurar, submodos inclusive. O original continua no
  código — o que você muda vira uma camada por cima, em `data/modes.json`.
- **Acesso remoto num comando** (`scripts/remote.sh`), com a senha oferecida
  antes de a porta abrir, e `scripts/install-service.sh` para a unit do systemd.
- **Oito modelos novos do kie.ai**, com o catálogo agora gerado do OpenAPI da
  documentação em vez de escrito à mão.

### Corrigido
- **A interface ignorava `BENCH_WEB_HOST` do `.env`.** O Vite não carrega `.env`
  ao avaliar sua configuração; o servidor lia o arquivo e a interface não. Numa
  VPS isso dava `remote.sh` dizendo OPEN, firewall liberado e a porta recusando
  conexão de fora.
- **Porta ocupada era resolvida em silêncio** subindo uma segunda interface em
  5201, que nenhum firewall liberava. Agora falha e diz.
- **A API subia em todas as interfaces.** `BENCH_API_HOST` passa a ser
  `127.0.0.1` por padrão: publicar a interface não publica mais a porta que
  grava arquivo e gasta dinheiro.
- **Dois dos quatro modelos do kie não existiam** (`nano-banana-pro/edit`,
  `veo3_fast`) e só falhariam na hora de gerar. O gerador valida cada id antes
  de gravar.
- **Unidade de cobrança desconhecida valia 1.** O Seedance 2.5 é cobrado em
  "1000 tokens" e anunciava US$ 0,0214 fixo, igual para 5s e 30s.
- **Crédito medido virou dólar verificado.** O kie publica pares preço/crédito em
  nove grupos e a razão bate em todos: US$ 0,005 por crédito.
- **Referência vinda de `/previews` ou `/projects`** chegava crua no provedor.
- **O stderr do CLI do Kling era descartado**, então todo erro dele virava
  "sessão expirada".
- **`--tailImage` ia para modelo que não aceita**, e modelos de até 7 ou 10
  referências recebiam só a primeira, em silêncio.
- **Busca anulava o filtro de saída** no seletor de modelo.
- **Texto solto na fileira de modos** parecia um modo sem botão; e os atalhos da
  barra, por serem lista fixa, sobreviviam ao modo escondido e mostravam o nome
  velho do modo renomeado.

### Documentação
- README dividido: instalar/operar/manter aqui, o que o sistema é em
  `docs/ABOUT.md`. Trilhas separadas para instalação local e em VPS, mais
  seções de chaves, senha e manutenção.
- `docs/ACESSO-REMOTO.md` e `docs/KIE-MODELOS.md` (levantamento dos 169 modelos
  do kie, com o que está registrado e por quê).
- Guia de uso publicado em `guia/`, no GitHub Pages.

## 1.4.2

### Novo
- **Interface bilíngue (pt-BR / en), com o português como padrão.** Nenhuma
  frase voltou a ser escrita dentro do JSX: cada texto virou uma chave e as duas
  traduções moram em `src/i18n/pt-BR.js` e `src/i18n/en.js`. O merge com o
  upstream (`promptadvisers/bench-studio-public`) segue limpo — quando ele mexe
  num componente, o conflito é no código, nunca em cada frase da tela.
  - Ordem de escolha do idioma: `?lang=` na URL → escolha guardada no navegador
    → idioma do navegador → pt-BR. Quem chega de fora cai em inglês sozinho.
  - Seletor **PT/EN** no canto direito da barra do topo (e na tela de senha).
  - O inglês é o único fallback de chave faltando: uma chave sem tradução
    aparece em inglês, nunca em português no meio da interface em inglês.
- **Glossário embutido** (`<Termo id="seed" />`). O jargão que a pessoa vai
  reencontrar em qualquer outra ferramenta — *prompt*, *seed*, *upscale*,
  *engine*, *provider*, *aspect ratio*, *MCP* — continua em inglês, mas com a
  explicação pendurada nele, no idioma da interface e disponível ao leitor de
  tela.
- **Erros do servidor agora carregam um `code`** estável junto da frase original.
  A interface traduz pelo código e cai na frase crua quando o código é novo. O
  campo `error` continua idêntico, então o MCP, a skill e qualquer outro
  consumidor não regridem.

### Corrigido
- **A barra do topo não cabia mais na tela do celular** — e isso já era verdade
  antes desta versão: em 390px o conteúdo do cabeçalho media 498px, com 63px
  sobrando para fora (o seletor de idioma teria levado isso a 108px). Agora os
  controles encolhem juntos abaixo de 660px, a marca perde a versão e o bloco
  `Usage` sai (o mesmo número está no painel de custos). Medido em 360px, 390px
  e 414px: zero de transbordo. O teste `mobile layouts have no horizontal
  overflow`, que reprovava, passa.
- Em 768px o seletor também estourava a linha; abaixo de 980px a marca cede
  espaço e o botão de idioma ficou compacto.

### Notas
- Os **valores** enviados aos modelos continuam em inglês de propósito (é onde
  eles rendem melhor): os submodos de cena, os enums de parâmetro e o prompt
  final saem em inglês mesmo com a interface em português.
- A suíte Playwright fixa `locale: "en-US"` e afirma o texto em inglês; o
  caminho em português tem dois testes próprios, que forçam `?lang=pt-BR`.

## 1.3.2

### Novo
- **Tela de configuração** (botão `Config`, no topo à direita, junto de Usage e
  Ledger). Mostra, por variável: se está presente, de onde veio (ambiente
  exportado, `.env` do projeto, `~/.env`), os 4 últimos caracteres e o que ela
  habilita. **Nenhum valor de segredo é enviado ao navegador** — presença,
  origem e cauda, nada além disso. Grava no `.env` do projeto com escrita
  atômica e permissão `600`, preservando comentários e variáveis desconhecidas.
- **Gravação só da própria máquina.** `POST /api/config` responde 403 quando a
  requisição não vem de loopback; com `--lan` a tela fica em modo leitura para
  quem está na rede. A checagem é no socket, não numa flag: `BENCH_WEB_HOST`
  governa em que interface o Vite escuta, não de onde a requisição chegou.
- **Aviso de exposição.** Com o estúdio publicado na rede, a tela diz o que isso
  significa: não há autenticação nenhuma, e quem alcança a porta gera com as
  suas chaves e lê o seu histórico.
- **Teste de provedor pela tela** (`POST /api/config/test/:provider`): pinga de
  verdade e devolve o motivo quando falha.
- **Error boundary por workspace.** Uma exceção numa aba vira um cartão de erro
  naquela aba, com o resto do estúdio vivo.

### Corrigido
- **A aba Models derrubava o estúdio inteiro.** `creditIds` era usado no botão
  "Plan credits" e nunca declarado: `ReferenceError` no render, React desmonta a
  árvore e a página fica preta — não só o catálogo, o app todo. `freeIds` e
  `creditIds` agora saem de `cost_class`, derivado do adapter, em vez da lista
  fixa `["agnes","inemaimg"]` que tinha ficado para trás na interface.
- **O `.env` do projeto nunca era lido.** O servidor só carregava `~/.env`,
  embora `.env.example` sempre tenha documentado a precedência com o arquivo do
  projeto no meio. Quem copiava o exemplo para `.env` não via efeito nenhum.
- **`BENCH_DATA_DIR` vindo de arquivo era ignorado em silêncio**: o carregamento
  do ambiente rodava depois de `DATA` já ter sido resolvido. O carregamento
  passou para antes de qualquer constante derivada de env.
- **Sem `FAL_KEY`, o estúdio não subia.** Morria no boot com `exit(1)`,
  contradizendo a regra que vale para todos os outros provedores — cada um
  aparece indisponível com o motivo. Quem usa só Agnes ou os modelos locais não
  conseguia nem abrir a interface para descobrir o que faltava. Agora sobe com
  um aviso, e os 37 modelos fal aparecem indisponíveis.
- **A suíte e2e nunca tinha rodado nesta máquina** (o Chromium do Playwright não
  estava instalado). O teste `primary navigation ... without console errors`
  cobria exatamente o bug do catálogo.

## 1.2.2

### Novo
- **Referência de acabamento configurável pela tela** (Websites e Documents), em
  vez de só variável de ambiente. Caminho inexistente é recusado na hora.
- Motores de modelo (Qwen local, OpenRouter) passam a receber a referência como
  **resumo de design** — tokens, fontes, paleta, raios. Injetar o HTML cru
  afogava o pedido: num teste medido, ocupou ~99% do prompt e a saída ignorou a
  referência por completo.

### Corrigido
- `stderrReason` ignorava a mensagem de um `throw new Error(...)`: o padrão
  exigia prefixo antes de "Error", casando com `TypeError` e falhando no `Error:`
  puro. A tela mostrava um quadro do stack no lugar do motivo.

## 1.1.2

### Novo
- Provedor vira chip com filtro e interruptor próprio no catálogo.
- Rota (provedor) visível ao lado do nome do modelo no seletor do Create.

### Corrigido
- "Grátis" era suposição escrita na interface; virou classe de custo derivada do
  orçamento de cada adapter (`no cost`, `plan credits`, `paid`, `priced after run`).

## 1.0.1

### Corrigido
- Clicar num card para ligar um modelo levava para a tela de criação. O modo
  curadoria escondido acabou: cada card tem interruptor próprio, sempre visível.

## 1.0.0

Primeira versão desta linha: camada de providers (fal, Agnes, KIE, Kling,
inemaimg), aba de modos, curadoria de catálogo, construtor com motor escolhível
e cadeia de refino de prompt com fallback.
