# kie.ai — o que existe lá, e o que este estúdio usa

Levantamento feito em **2026-08-18**, contra a documentação viva e a API. Só
leitura: nada foi alterado no servidor nem no catálogo. Serve para decidir
**quais modelos vale registrar** e o que cada um exige.

Fontes: [kie.ai/market](https://kie.ai/market) (lista oficial),
[docs.kie.ai/market/quickstart](https://docs.kie.ai/market/quickstart) (contrato
da API), e o próprio `server/providers/kie.mjs`.

---

## O resumo, se você só quer o número

| | |
|---|---|
| Páginas de modelo na documentação | **169** |
| Registradas neste estúdio | **4** (`z-image`, `nano-banana-pro`, `nano-banana-pro/edit`, `veo3_fast`) |
| Famílias de **vídeo** | 9 (Kling, Wan, Bytedance/Seedance, PixVerse, MiniMax H3, Hailuo, Grok Imagine, HappyHorse, avatares) |
| Famílias de **imagem** | 12+ (Seedream, Google/Imagen/Nano Banana, Flux-2, Qwen3, GPT Image, Ideogram, Z-Image, Topaz, Recraft, Wan Image…) |
| Saldo da conta hoje | **538 créditos** (`GET /api/v1/chat/credit`) |

O motivo de só 4 estarem registrados está no próprio `kie.models.json`: a lista
é escrita à mão porque **o kie não publica preço por modelo em API**, e sem
preço o orçamento sairia em branco ou chutado. Ver "O buraco do preço".

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

## O buraco do preço

**Não existe endpoint de preço por modelo.** O que existe:

- `https://kie.ai/pricing` — a página é montada no navegador; buscá-la devolve o
  esqueleto sem a tabela.
- `https://kie.ai/logs` — a documentação chama de **fonte de verdade** do
  consumo: por tarefa, mostra modelo, parâmetros, status e créditos gastos.
- `GET /api/v1/chat/credit` — só o **saldo** (538 hoje). É com ele que o adapter
  mede o consumo real pelo delta, depois da geração.

Consequência prática: registrar um modelo novo exige **estimar** o preço na
tabela offline do `kie.mjs`, e essa estimativa entra rotulada como estimada. O
valor real só aparece depois da primeira geração, medido pelo saldo. Não é
descuido do estúdio — é o que o provedor oferece.

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

Um detalhe do adapter que vira limite hoje: o `refsFrom` monta sempre
`input.image_urls` e corta em **2 referências**. Modelos que usam
`first_frame_url`/`last_frame_url` (Wan 2.7, Seedance 2, MiniMax H3) ou
`reference_image_urls` com teto maior precisariam que esse mapeamento respeitasse
o nome do campo declarado, como foi feito no Kling — senão a imagem vai no campo
errado e o kie recusa.

---

## O que eu recomendaria registrar primeiro

Em ordem de utilidade sobre o que o estúdio já tem:

1. **`wan/2-7-image-to-video`** — quadro inicial e final, duração e resolução
   controláveis. Preenche a lacuna de keyframes fora do Kling.
2. **`bytedance/seedance-2-fast`** — keyframes **mais** referências soltas no
   mesmo modelo; e o Seedance 2.5 pela fal é justamente o que hoje não é
   orçável, então ter a rota do kie dá uma alternativa medível em créditos.
3. **`pixverse-v6/transition`** — o modelo cuja razão de existir é a transição
   entre dois quadros.
4. **`seedream/5-pro-image-to-image`** e **`flux-2/flex-image-to-image`** — edição
   de imagem barata, para não gastar dólar da fal em teste.
5. **`topaz/video-upscale`** e **`recraft/remove-background`** — utilitários que
   o estúdio não tem em nenhum provedor.

Nada disso foi feito: este documento é o levantamento, não a mudança.
