# kie.ai — o que existe lá, e o que este estúdio usa

Levantamento feito em **2026-08-18** contra a documentação viva e a API, e a
rodada de correção que veio dele. Serve para saber o que existe lá, o que está
registrado aqui, e por que a diferença.

Fontes: [kie.ai/market](https://kie.ai/market) (lista oficial),
[docs.kie.ai/market/quickstart](https://docs.kie.ai/market/quickstart) (contrato
da API), e o próprio `server/providers/kie.mjs`.

---

## O resumo, se você só quer o número

| | |
|---|---|
| Páginas de modelo na documentação | **169** |
| Registradas neste estúdio | **12** (eram 4, e **duas das quatro eram inválidas** — ver auditoria) |
| Famílias de **vídeo** | 9 (Kling, Wan, Bytedance/Seedance, PixVerse, MiniMax H3, Hailuo, Grok Imagine, HappyHorse, avatares) |
| Famílias de **imagem** | 12+ (Seedream, Google/Imagen/Nano Banana, Flux-2, Qwen3, GPT Image, Ideogram, Z-Image, Topaz, Recraft, Wan Image…) |
| Saldo da conta hoje | **538 créditos** (`GET /api/v1/chat/credit`) |

A lista de caminhos é curada à mão — existe listagem
(`/api/v1/playground/model-paths`, 241 ids), mas ela não traz rota, parâmetros
nem campos de imagem, que é o que o catálogo precisa. Ver "Preço" para o que a
API do playground **também** entrega e eu tinha dado como inexistente.

---

## Auditoria dos que já estavam registrados (2026-08-18)

Um `POST /jobs/createTask` com `input` vazio distingue as duas falhas sem
enfileirar tarefa nem gastar crédito: modelo que **existe** reclama de campo
(`"prompt is required"`), modelo que **não existe** reclama do nome
(`"The model name you specified is not supported"`). Rodado nos quatro:

| Registrado antes | Veredito |
|---|---|
| `z-image` | ✅ existe |
| `nano-banana-pro` | ✅ existe |
| `nano-banana-pro/edit` | ❌ **não existe** — a rota de edição é `google/nano-banana-edit`, e o Nano Banana Pro já aceita imagem no mesmo id |
| `veo3_fast` | ❌ **não existe em `/jobs/createTask`** — o Veo tem API própria (`POST /api/v1/veo/generate`), que este adapter não fala |

Ou seja: metade do catálogo do kie estava quebrada e só falharia na hora de
gerar, com um 422 genérico. Os dois inválidos saíram; o `veo3_fast` só volta se
alguém implementar a rota `/veo/*`, que é outro contrato.

Hoje o catálogo é **gerado**, não escrito: `node server/providers/kie_sync.mjs`
lê o OpenAPI de cada página (`docs.kie.ai/<caminho>.md`), deriva id, parâmetros,
enums, defaults e campos de imagem, e **valida cada id** com o probe acima antes
de gravar.

### O que está registrado agora

| Modelo | Rota | Entradas |
|---|---|---|
| `kie/z-image` | t2i | — |
| `kie/nano-banana-2` | t2i | `image_input` (até 14) |
| `kie/nano-banana-pro` | i2i | `image_input` (até 8) |
| `kie/google/nano-banana-edit` | i2i | `image_urls` (até 10) |
| `kie/seedream/5-pro-image-to-image` | i2i | `image_urls` (até 10) |
| `kie/flux-2/flex-image-to-image` | i2i | `input_urls` (até 8) |
| `kie/wan/2-7-image-to-video` | i2v | **quadro inicial + final** |
| `kie/bytedance/seedance-2-fast` | i2v | **quadro inicial + final** + `reference_image_urls` (até 3) |
| `kie/pixverse-v6/transition` | i2v | **quadro inicial + final** |
| `kie/minimax-h3/image-to-video` | i2v | **quadro inicial + final** |
| `kie/hailuo/2-3-image-to-video-pro` | i2v | `image_url` |
| `kie/kling/v3-turbo-image-to-video` | i2v | `image_urls` |

Quatro deles caem direto nos dois seletores numerados da interface.

---

## O contrato é um só

Todos os 169 passam pelo mesmo par de endpoints — o que o adapter já fala:

```
POST /api/v1/jobs/createTask     { "model": "<id>", "input": { ... } }
GET  /api/v1/jobs/recordInfo?taskId=<id>
```

Três coisas medidas que continuam valendo:

- **`recordInfo` é o polling certo.** O `getTask` que aparece em código antigo
  responde 404.
- **Referência precisa ser URL pública.** Data URI e caminho local são
  recusados; o upload do próprio estúdio devolve URL pública do storage do fal,
  então o caminho normal da interface funciona.
- **Limite de banda:** 20 novas gerações a cada 10 segundos por conta, ~100
  tarefas simultâneas. Acima disso é HTTP 429, e o pedido recusado **não** entra
  na fila.

**O `model` é quase sempre o caminho da doc, mas não sempre.** `/market/wan/2-7-image-to-video`
→ `wan/2-7-image-to-video`, e até aí tudo bem; mas `/market/pixverse/transition`
→ `pixverse-v6/transition`, `/market/kling/text-to-video` → `kling-2.6/text-to-video`,
`/market/google/pro-image-to-image` → `nano-banana-pro`. **Registrar de cabeça,
pelo caminho da URL, erra.** Cada entrada precisa do id que a página declara.

---

## Vídeo — o que cada modelo aceita

Campos além de `prompt`. Marquei em **negrito** os que dão **quadro inicial e
final**, porque é o recurso que a interface já sabe mostrar como dois seletores.

### Kling (16 páginas)

| model | entradas |
|---|---|
| `kling-2.6/text-to-video` | aspect_ratio, duration |
| `kling-2.6/image-to-video` | image_urls, duration |
| `kling/v2-5-turbo-image-to-video-pro` | image_url, duration, negative_prompt, quality |
| `kling/v2-5-turbo-text-to-video-pro` | duration, aspect_ratio, negative_prompt, quality |
| `kling/v2-1-master-image-to-video` | image_url, duration, negative_prompt, quality |
| `kling/v2-1-pro`, `kling/v2-1-standard` | image_url, duration, negative_prompt, quality |
| `kling-3.0/video` | image_urls, duration, resolution, quality, mode, aspect_ratio |
| `kling/v3-turbo-text-to-video` | duration, aspect_ratio, resolution |
| `kling/v3-turbo-image-to-video` | image_urls, duration, resolution |
| `kling-3.0-omni/image-to-video` | image_urls, duration, resolution, aspect_ratio |
| `kling-3.0-omni/reference-to-video` | image_urls, duration, resolution, aspect_ratio |
| `kling-3.0-omni/text-to-video` | duration, resolution, aspect_ratio |
| `kling-3.0-omni/transformation` | resolution, aspect_ratio |
| `kling/ai-avatar-standard` (e `-pro`) | image_url, audio_url |
| `kling-3.0/motion-control` | mode |

Nenhum Kling **pelo kie** expõe quadro final — diferente da rota própria do
Kling (CLI), onde `v2_5`, `v2_6` e `v3_0` aceitam `tail_image`.

### Wan (8 de vídeo)

| model | entradas |
|---|---|
| **`wan/2-7-image-to-video`** | **first_frame_url, last_frame_url**, duration, resolution, quality, negative_prompt, seed |
| `wan/2-7-text-to-video` | duration, resolution, quality, negative_prompt, audio_url, seed |
| `wan/2-7-r2v` | duration, resolution, quality, aspect_ratio, negative_prompt, seed |
| `wan/2-7-videoedit` | duration, resolution, quality, aspect_ratio, negative_prompt, seed |
| `wan/2-6-image-to-video` | image_urls, duration, resolution |
| `wan/2-6-text-to-video` | duration, resolution, quality |
| `wan/2-5-image-to-video` | image_url, duration, resolution, quality, negative_prompt, seed |
| `wan/2-5-text-to-video` | duration, aspect_ratio, resolution, quality, negative_prompt, seed |

### Bytedance / Seedance (7)

| model | entradas |
|---|---|
| **`bytedance/seedance-2`** | **first_frame_url, last_frame_url**, reference_image_urls, duration, resolution, aspect_ratio |
| **`bytedance/seedance-2-fast`** | idem |
| **`bytedance/seedance-2-mini`** | idem |
| `bytedance/seedance-2-5` | reference_image_urls, duration, resolution, aspect_ratio |
| `bytedance/seedance-1.5-pro` | duration, resolution, aspect_ratio |
| `bytedance/v1-pro-image-to-video` | image_url, duration, resolution, seed |
| `bytedance/v1-pro-text-to-video` | duration, resolution, aspect_ratio, seed |

### PixVerse V6 (5)

| model | entradas |
|---|---|
| **`pixverse-v6/transition`** | **first_frame_image_url, last_frame_image_url**, duration, quality, seed |
| `pixverse-v6/image-to-video` | image_urls, duration, quality, seed |
| `pixverse-v6/text-to-video` | aspect_ratio, duration, quality, seed |
| `pixverse-v6/reference-to-video` | image_url, aspect_ratio, duration, quality, seed |
| `pixverse-v6/extend` | duration, quality, seed |

### MiniMax H3, Hailuo, Grok, HappyHorse, avatares

| model | entradas |
|---|---|
| **`minimax-h3/image-to-video`** | **first_frame_url, last_frame_url**, duration |
| `minimax-h3/reference-to-video` | reference_image_urls, aspect_ratio, duration |
| `minimax-h3/text-to-video` | aspect_ratio, duration |
| **`hailuo/02-image-to-video-pro`** | **image_url, end_image_url** |
| `hailuo/2-3-image-to-video-pro` / `-standard` | image_url, duration, resolution (+quality no standard) |
| `grok-imagine/image-to-video` | image_urls, duration, resolution, aspect_ratio, mode |
| `grok-imagine/text-to-video` | duration, resolution, aspect_ratio, mode |
| `grok-imagine-video-1-5-preview` | image_urls, duration, resolution, aspect_ratio |
| `grok-imagine/upscale`, `/extend` | só o vídeo de entrada |
| `happyhorse/image-to-video` | image_urls, duration, resolution, seed |
| `happyhorse/text-to-video`, `/reference-to-video` | duration, resolution, aspect_ratio, seed |
| `happyhorse/video-edit` | video_url, resolution, seed |
| `omnihuman-1-5` | image_url, audio_url, seed |
| `infinitalk/from-audio` | image_url, audio_url, resolution |
| `topaz/video-upscale` | video_url, resolution, quality |

**Sete rotas com quadro inicial e final** (`wan/2-7-image-to-video`, os três
`seedance-2*`, `pixverse-v6/transition`, `minimax-h3/image-to-video`,
`hailuo/02-image-to-video-pro`). Elas cairiam direto nos dois seletores
numerados que a interface já tem — desde que os campos sejam declarados como
duas entradas de uma vaga cada, como foi feito no Kling.

### Fora do Market: Veo e Sora

Veo **não** está no Market: mora numa API própria, `/veo3-api/*` (Veo 3.1, com
endpoints de 1080p e 4K). É por isso que o `kie/veo3_fast` deste estúdio é uma
entrada manual. **Sora não aparece** em lugar nenhum da documentação hoje —
se alguém disser que o kie tem Sora, essa afirmação não se sustenta no material
público de hoje. Suno (música) também tem API própria, `/suno-api/*`, com 47
páginas.

---

## Imagem — as famílias e seus ids

| model | entradas |
|---|---|
| `z-image` | aspect_ratio |
| `google/nano-banana` / `nano-banana-edit` | (edit: image_urls) output_format, aspect_ratio |
| `nano-banana-pro`, `nano-banana-2` | aspect_ratio, resolution, output_format |
| `nano-banana-2-lite` | image_urls, aspect_ratio |
| `google/imagen4`, `-fast`, `-ultra` | aspect_ratio, negative_prompt, style, seed |
| `bytedance/seedream-v4-text-to-image` / `-edit` | image_size, quality, seed (edit: image_urls, style) |
| `seedream/4.5-text-to-image` / `4.5-edit` | aspect_ratio, quality, style (edit: image_urls) |
| `seedream/5-lite-text-to-image` | aspect_ratio, quality, style, output_format |
| `seedream/5-pro-text-to-image` / `5-pro-image-to-image` | aspect_ratio, quality, style, output_format (i2i: image_urls) |
| `seedream/5-pro-layer-decomposition` | image_url, quality, output_format |
| `flux-2/pro-text-to-image` / `pro-image-to-image` | aspect_ratio, resolution, quality |
| `flux-2/flex-text-to-image` / `flex-image-to-image` | aspect_ratio, resolution, quality |
| `qwen3/text-to-image` / `image-to-image` | image_size, resolution, output_format, negative_prompt, quality, seed |
| `qwen3/pro-text-to-image` / `pro-image-to-image` | idem |
| `gpt-image-2-text-to-image` / `-image-to-image` | aspect_ratio |
| `ideogram/v3-text-to-image` | image_size, style, negative_prompt, seed |
| `ideogram/v3-edit` | image_url, mask_url, seed |
| `ideogram/character` | reference_image_urls, style, num_images, image_size, negative_prompt |
| `wan/2-7-image`, `wan/2-7-image-pro` | resolution, seed |
| `topaz/image-upscale` | image_url, resolution, quality |
| `recraft/remove-background`, `recraft/crisp-upscale` | (upscale: resolution, quality) |

Há ainda uma prateleira de **texto** no mesmo Market (Claude, GPT-5.x, Gemini,
Grok) e de **áudio** (ElevenLabs, Gemini TTS). Fora do escopo do estúdio, que é
imagem e vídeo — mas anotado, porque explica por que a contagem de "modelos do
kie" que você vê por aí é tão alta.

---

## Preço: o que existe, e o que eu tinha errado

**Correção.** Na primeira versão deste documento eu escrevi que não havia API de
listagem nem de preço. Havia as duas, atrás da API do playground — as mesmas que
a página `kie.ai/pricing` consome no navegador:

| Endpoint | O que dá |
|---|---|
| `GET /api/v1/playground/model-paths` | **241 ids de modelo**, a lista inteira |
| `POST /api/v1/playground/pagePlaygroundGroup` | 99 grupos, cada um com `priceInfoJson` |
| `GET /api/v1/chat/credit` | saldo da conta (538 hoje) |

O preço é **por grupo, e parcial**: dos 99 grupos, só **9** trazem valor. Estes:

| Grupo | US$ | Créditos | Unidade |
|---|---|---|---|
| `z-image` | 0,004 | 0,8 | imagem |
| `flux-2` | 0,025 | 5 | imagem |
| `seedream-4-5` | 0,032 | 6,5 | imagem |
| `topaz-image-upscale` | 0,05 | 10 | imagem |
| `seedance-1-0-pro-fast` | 0,08 | 16 | 10s |
| `nano-banana-pro` | 0,09 | 18 | imagem |
| `grok-imagine` | 0,10 | 20 | 6s |
| `hailuo-2-3` | 0,15 | 30 | 6s |
| `kling-2-6` | 0,28 | 55 | 5s |

### A descoberta que vale mais que a tabela

Cada linha traz **dólar e crédito juntos**, e a razão bate em todas:

```
0,004/0,8 = 0,00500      0,09/18 = 0,00500      0,15/30 = 0,00500
0,025/5   = 0,00500      0,10/20 = 0,00500      0,28/55 = 0,00509
0,032/6,5 = 0,00492      0,08/16 = 0,00500      0,05/10 = 0,00500
```

**US$ 0,005 por crédito**, publicado pelo próprio kie. Isso resolve um limite
antigo do adapter: o consumo em créditos já era **medido** (delta de saldo antes
e depois de cada geração), mas virava um dólar estimado porque a taxa não era
conhecida. Agora o custo real registrado no ledger é `créditos medidos × 0,005`,
com confiança **verificada** — sem inventar conversão, que era exatamente o que
o código se recusava a fazer, e com razão, enquanto a taxa não existia.

O `quote` **antes** de rodar continua sendo estimativa quando o grupo não tem
preço publicado; o rótulo diz qual é qual (`published (kie)` × `estimated`).

---

## Se for registrar um modelo novo

Três arquivos, nesta ordem:

1. **`server/providers/kie.models.json`** — id (`kie/<model exato da doc>`),
   lane, label, `media_inputs` refletindo os campos reais (dois campos de uma
   vaga quando houver primeiro e último quadro), `params` com os enums que a
   página declara.
2. **`server/providers/kie.mjs`** — preço estimado em `PRICE`.
3. Reiniciar o servidor. O manifesto de capacidades se invalida sozinho quando
   os campos declarados mudam.

**Corrigido junto com esta rodada:** o adapter empacotava tudo em
`input.image_urls`, cortado em duas referências, e mandava `aspect_ratio: "16:9"`
em toda geração. Isso quebraria metade dos modelos acima — cada família batiza o
campo do seu jeito (`first_frame_url`, `first_frame_image_url`, `image_input`,
`input_urls`) e nem todas conhecem `aspect_ratio`. Agora o adapter monta o corpo
a partir do que o **modelo declara** no registry: cada imagem vai no seu campo,
com o teto do próprio campo, e parâmetro que o modelo não declara não é
enviado.

---

## O que ficou de fora, e por quê

Registrados nesta rodada: os cinco primeiros da recomendação original. Fora:

- **`topaz/video-upscale`, `recraft/remove-background`, `grok-imagine/extend`** —
  são utilitários que recebem **vídeo** ou funcionam sem prompt. O estúdio hoje
  monta toda geração em torno de um prompt e de anexos de imagem; encaixá-los
  exige mais que uma entrada no catálogo.
- **Avatares (`kling/ai-avatar-*`, `omnihuman-1-5`, `infinitalk/from-audio`)** —
  precisam de `audio_url`, e o fluxo de anexo de áudio não existe aqui.
- **Veo** — API própria, outro contrato.
- **O restante dos 169** — a maioria é variação de família já coberta (Seedream
  3/4/4.5/5-lite, Wan 2.5/2.6, Kling 2.1/2.5/2.6, Hailuo 02, HappyHorse). Cada
  novo é uma linha em `CATALOGO` no `kie_sync.mjs` e um preço estimado; o resto
  o gerador faz.
