# Changelog

Versionamento `X.XX.YY`: dentro do mesmo major, o `YY` nunca volta a zero —
correção incrementa `YY`, mudança de comportamento incrementa `XX` carregando o
`YY`, e só a virada de major zera o resto.

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
