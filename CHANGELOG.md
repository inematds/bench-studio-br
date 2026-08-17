# Changelog

Versionamento `X.XX.YY`: dentro do mesmo major, o `YY` nunca volta a zero —
correção incrementa `YY`, mudança de comportamento incrementa `XX` carregando o
`YY`, e só a virada de major zera o resto.

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
