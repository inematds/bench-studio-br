// kie_sync.mjs — gera kie.models.json a partir do OpenAPI que a doc do kie
// publica por modelo.
//
// Por que existe: a lista do kie era escrita a mao, e mao erra. Auditoria de
// 2026-08-18 (probe de createTask com input vazio, que valida o id sem gastar
// credito) encontrou DOIS dos quatro modelos registrados invalidos:
//
//   nano-banana-pro/edit -> nao existe; a rota de edicao e `google/nano-banana-edit`
//   veo3_fast            -> nao existe em /jobs/createTask; o Veo mora noutra
//                           API (POST /api/v1/veo/generate), que este adapter
//                           nao fala
//
// O kie NAO tem API de listagem de modelos (medido: /models, /jobs/models e
// /market/models respondem 404), entao a lista de CAMINHOS abaixo continua
// curada a mao. O que deixou de ser manual e o resto: id real, parametros,
// enums, defaults e campos de imagem saem do `<pagina>.md`, que devolve o
// OpenAPI do modelo.
//
//   node server/providers/kie_sync.mjs           # regenera
//   node server/providers/kie_sync.mjs --check   # so valida os ids, nao grava
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = "https://docs.kie.ai";

// Caminho na doc -> como o modelo entra no estudio. `lane` segue a convencao do
// registry: t2i, i2i, t2v, i2v, r2v.
const CATALOGO = [
  { path: "market/z-image/z-image", lane: "t2i", label: "Z-Image" },
  { path: "market/google/nanobanana2", lane: "t2i", label: "Nano Banana 2" },
  { path: "market/google/pro-image-to-image", lane: "i2i", label: "Nano Banana Pro" },
  { path: "market/google/nano-banana-edit", lane: "i2i", label: "Nano Banana edit" },
  { path: "market/seedream/5-pro-image-to-image", lane: "i2i", label: "Seedream 5 Pro edit" },
  { path: "market/flux2/flex-image-to-image", lane: "i2i", label: "FLUX.2 flex edit" },
  { path: "market/wan/2-7-image-to-video", lane: "i2v", label: "Wan 2.7 i2v" },
  { path: "market/bytedance/seedance-2-fast", lane: "i2v", label: "Seedance 2 fast" },
  { path: "market/pixverse/transition", lane: "i2v", label: "PixVerse V6 transição" },
  { path: "market/minimax-h3/image-to-video", lane: "i2v", label: "MiniMax H3 i2v" },
  { path: "market/hailuo/2-3-image-to-video-pro", lane: "i2v", label: "Hailuo 2.3 Pro i2v" },
  { path: "market/kling/v3-turbo-image-to-video", lane: "i2v", label: "Kling v3 turbo i2v" },
];

// TAXA CREDITO -> DOLAR, derivada dos pares que o proprio kie publica em
// `pagePlaygroundGroup.priceInfoJson`. Nove grupos trazem preco e creditos
// juntos, e a razao bate em todos: 0.8cr/$0.004, 5cr/$0.025, 18cr/$0.09,
// 20cr/$0.10, 30cr/$0.15, 55cr/$0.28... Ou seja **US$ 0,005 por credito**.
//
// Isso muda o que o adapter consegue afirmar: o consumo em creditos ja era
// MEDIDO pelo delta de saldo depois de cada geracao; com a taxa publicada, esse
// numero vira dolar sem chute. O `quote` antes de rodar continua estimado.
export const USD_POR_CREDITO = 0.005;

// Preco por geracao, em US$. Os que o kie publica entram como PUBLICADO; o
// resto e estimativa nossa e o adapter rotula como tal. Nao ha endpoint de
// preco por MODELO — o que existe e por GRUPO, e so 9 dos 99 grupos preenchem.
export const PRECO_PUBLICADO = {
  "z-image": { usd: 0.004, creditos: 0.8, unidade: "imagem" },
  "nano-banana-pro": { usd: 0.09, creditos: 18, unidade: "imagem" },
  "flux-2/flex-image-to-image": { usd: 0.025, creditos: 5, unidade: "imagem" },
  "hailuo/2-3-image-to-video-pro": { usd: 0.15, creditos: 30, unidade: "6s" },
};

export const PRECO_ESTIMADO = {
  "z-image": 0.004,
  "nano-banana-2": 0.05,
  "nano-banana-pro": 0.05,
  "google/nano-banana-edit": 0.02,
  "seedream/5-pro-image-to-image": 0.03,
  "flux-2/flex-image-to-image": 0.03,
  "wan/2-7-image-to-video": 0.30,
  "bytedance/seedance-2-fast": 0.25,
  "pixverse-v6/transition": 0.20,
  "minimax-h3/image-to-video": 0.30,
  "hailuo/2-3-image-to-video-pro": 0.28,
  "kling/v3-turbo-image-to-video": 0.35,
};

// ------------------------------------------------------------------ parsing
// O .md traz o OpenAPI em YAML. Nao ha parser de YAML no projeto e nao vale uma
// dependencia por isto: o bloco que interessa e regular (indentacao fixa,
// escalares simples), entao le-se so o que se entende, e o que nao se entende
// fica de fora em vez de virar chute.
function blocoInput(md) {
  // A indentacao do YAML muda de pagina para pagina (16 espacos numa, 18
  // noutra), entao localizar por contagem quebra. O que nao muda e o formato:
  // uma chave `input:` sozinha, seguida de `type: object`.
  const todas = md.split("\n");
  const i = todas.findIndex((l, k) =>
    /^\s*input:\s*$/.test(l) && /^\s*type:\s*object\s*$/.test(todas[k + 1] ?? ""));
  if (i < 0) return null;
  const linhas = todas.slice(i);
  const base = linhas[0].search(/\S/);
  const out = [linhas[0]];
  for (const l of linhas.slice(1)) {
    if (l.trim() && l.search(/\S/) <= base) break;
    out.push(l);
  }
  return out;
}

function propriedades(linhas) {
  const iProps = linhas.findIndex((l) => /^\s*properties:\s*$/.test(l));
  if (iProps < 0) return { props: {}, required: [] };

  const required = [];
  const iReq = linhas.findIndex((l) => /^\s*required:\s*$/.test(l));
  if (iReq >= 0) {
    for (const l of linhas.slice(iReq + 1)) {
      const m = l.match(/^\s*-\s+(\S+)\s*$/);
      if (!m) break;
      required.push(m[1]);
    }
  }

  const nivel = linhas[iProps].search(/\S/);
  const props = {};
  let atual = null;
  let chaveLista = null;

  for (const l of linhas.slice(iProps + 1)) {
    if (!l.trim()) continue;
    const ind = l.search(/\S/);
    if (ind <= nivel) break;

    const nome = l.match(/^\s*([a-zA-Z_][\w]*):\s*$/);
    if (nome && ind === nivel + 2) {
      atual = nome[1];
      props[atual] = { name: atual, type: "string" };
      chaveLista = null;
      continue;
    }
    if (!atual) continue;

    const item = l.match(/^\s*-\s+(.+?)\s*$/);
    if (item && chaveLista) {
      const v = item[1].replace(/^['"]|['"]$/g, "");
      (props[atual][chaveLista] ??= []).push(v);
      continue;
    }

    const par = l.match(/^\s*([a-zA-Z_]+):\s*(.*)$/);
    if (!par) continue;
    const [, k, vRaw] = par;
    const v = vRaw.trim();
    chaveLista = null;

    if (k === "enum" && v === "") { chaveLista = "enum"; continue; }
    if (k === "examples") { chaveLista = null; continue; }
    if (["type", "default", "minimum", "maximum", "maxItems", "format"].includes(k) && v !== "") {
      const limpo = v.replace(/^['"]|['"]$/g, "");
      props[atual][k] = /^-?\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : limpo;
    }
    if (k === "description" && v && !v.startsWith(">") && !v.startsWith("|")) {
      props[atual].description = v.replace(/^['"]|['"]$/g, "").slice(0, 200);
    }
  }
  return { props, required };
}

// Nome do campo -> papel. Aqui esta a licao do Kling: o campo do PRIMEIRO e do
// ULTIMO quadro sao entradas distintas, de uma vaga cada, e nao uma lista onde
// a ordem decide.
const PRIMEIRO = /^(first_frame_url|first_frame_image_url|image_url|input_image)$/;
const ULTIMO = /^(last_frame_url|last_frame_image_url|end_image_url|tail_image)$/;
// `image_input` (Nano Banana) e `input_urls` (FLUX.2) sao listas apesar do nome
// no singular — cada familia batiza o campo do seu jeito. E por isso que este
// mapa existe: adivinhar pelo nome, sem olhar o `type`, colocaria oito imagens
// num campo de uma vaga so.
const LISTA = /^(image_urls|input_urls|reference_image_urls|image_input)$/;

function mediaInputs(props) {
  const out = [];
  for (const p of Object.values(props)) {
    if (PRIMEIRO.test(p.name) && p.type !== "array") {
      out.push({
        name: p.name, type: "string", title: "Quadro inicial",
        description: p.description ?? "Imagem em que o vídeo começa.",
        modality: "image", role: "source", arity: "single", required: true,
      });
    } else if (ULTIMO.test(p.name)) {
      out.push({
        name: p.name, type: "string", title: "Quadro final",
        description: p.description ?? "Imagem em que o vídeo termina.",
        modality: "image", role: "source", arity: "single", required: false,
      });
    } else if (LISTA.test(p.name)) {
      out.push({
        name: p.name, type: "array", title: "Imagens de referência",
        description: p.description ?? "Imagens de referência (URL pública).",
        modality: "image", role: "source", arity: "multiple", required: false,
        limits: p.maxItems ? { max_items: p.maxItems } : undefined,
      });
    }
  }
  // Um modelo de imagem que so tem lista: ela e a entrada obrigatoria.
  if (out.length === 1 && out[0].arity === "multiple") out[0].required = true;
  return out;
}

const IGNORAR = new Set([
  "prompt", "callBackUrl", "watermark", "prompt_extend", "web_search",
  "return_last_frame", "first_clip_url", "driving_audio_url",
  "reference_video_urls", "reference_audio_urls",
]);

function params(props) {
  const out = {};
  for (const p of Object.values(props)) {
    if (IGNORAR.has(p.name)) continue;
    if (PRIMEIRO.test(p.name) || ULTIMO.test(p.name) || LISTA.test(p.name)) continue;
    const spec = { name: p.name, type: p.type === "integer" || p.type === "number" ? "number" : "string" };
    if (p.description) spec.description = p.description;
    if (p.enum?.length) spec.enum = p.enum;
    if (p.default !== undefined) spec.default = p.default;
    if (p.minimum !== undefined) spec.min = p.minimum;
    if (p.maximum !== undefined) spec.max = p.maximum;
    out[p.name] = spec;
  }
  return out;
}

async function modeloDe(entry) {
  const md = await (await fetch(`${DOCS}/${entry.path}.md`, { headers: { "user-agent": "bench-studio" } })).text();
  const id = (md.match(/"model"\s*:\s*"([^"]+)"/) ?? [])[1];
  if (!id) throw new Error(`${entry.path}: nao achei o id do modelo no OpenAPI`);

  const linhas = blocoInput(md);
  if (!linhas) throw new Error(`${entry.path}: nao achei o bloco input`);
  const { props } = propriedades(linhas);

  const media = mediaInputs(props);
  const principal = media.find((m) => m.arity === "single") ?? media[0] ?? null;

  return {
    id: `kie/${id}`,
    provider: "kie",
    kind: entry.lane.endsWith("v") ? "video" : "image",
    lane: entry.lane,
    label: `${entry.label} · via kie.ai`,
    vendor: "kie.ai",
    category: entry.lane,
    thumbnail: null,
    doc: `${DOCS}/${entry.path}`,
    image_input: principal ? { name: principal.name, arity: principal.arity, required: Boolean(principal.required) } : null,
    image_inputs: media.map((m) => m.name),
    media_inputs: media,
    accepts_image: principal?.arity ?? null,
    image_param: principal?.name ?? null,
    required: ["prompt"],
    params: params(props),
    pricing: precoDe(id),
  };
}

function precoDe(id) {
  const publicado = PRECO_PUBLICADO[id];
  if (publicado) {
    return {
      usd: publicado.usd,
      credits: publicado.creditos,
      unit: publicado.unidade,
      source: "publicado pelo kie (playground/pagePlaygroundGroup)",
      confidence: "published",
    };
  }
  const estimado = PRECO_ESTIMADO[id];
  if (estimado == null) return null;
  return {
    usd: estimado,
    credits: Number((estimado / USD_POR_CREDITO).toFixed(1)),
    unit: "geração",
    source: "estimativa local; o kie publica preço só de 9 dos 99 grupos",
    confidence: "estimated",
  };
}

// Valida o id sem gastar credito: `createTask` com input vazio devolve erro de
// CAMPO quando o modelo existe, e "model name not supported" quando nao existe.
async function idValido(id) {
  const key = process.env.KIE_API_KEY;
  if (!key) return null;
  const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: id.replace(/^kie\//, ""), input: {} }),
  });
  const j = await r.json().catch(() => ({}));
  return !/model name you specified is not supported/i.test(j?.msg ?? "");
}

const soChecar = process.argv.includes("--check");
const models = [];
for (const entry of CATALOGO) {
  const m = await modeloDe(entry);
  const ok = await idValido(m.id);
  const marca = ok === null ? "?" : ok ? "ok" : "INVALIDO";
  console.log(`  ${marca.padEnd(9)} ${m.id.padEnd(38)} ${m.media_inputs.map((i) => i.name).join(", ") || "sem imagem"}`);
  if (ok === false) throw new Error(`${m.id} nao existe na API do kie — corrija o caminho em CATALOGO`);
  models.push(m);
}

if (soChecar) {
  console.log(`\n${models.length} modelos conferidos, nada gravado (--check).`);
} else {
  const out = {
    _meta: {
      provider: "kie",
      generated_at: new Date().toISOString(),
      source: "OpenAPI de cada pagina da doc (docs.kie.ai/<caminho>.md)",
      regenerate: "node server/providers/kie_sync.mjs",
      lista_curada: "existe listagem em /api/v1/playground/model-paths (241 ids), mas ela nao traz lane, params nem campos de imagem — por isso os CAMINHOS da doc continuam curados a mao em CATALOGO, e o resto e derivado do OpenAPI de cada pagina",
      preco: "quando o kie publica (9 dos 99 grupos em playground/pagePlaygroundGroup) o valor entra como publicado; senao e estimativa local. A taxa credito->dolar (US$ 0,005) sai dos pares publicados e bate nos nove, entao o consumo MEDIDO em creditos vira dolar sem chute",
      validacao: "cada id e conferido com createTask de input vazio, que erra por CAMPO quando o modelo existe e por MODELO quando nao existe — sem enfileirar tarefa nem gastar credito",
      auditoria_2026_08_18: "nano-banana-pro/edit e veo3_fast estavam registrados e NAO existem em /jobs/createTask; o Veo tem API propria (POST /api/v1/veo/generate), fora do alcance deste adapter",
    },
    models,
  };
  writeFileSync(join(HERE, "kie.models.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nkie.models.json: ${models.length} modelos`);
}
