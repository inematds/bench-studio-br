// kie.mjs — adapter do kie.ai para a camada PROVIDERS.
//
// Portado de img_kie() / _kie_poll() / vid_kie() em
// ~/projetos/videoanima-skill/provedores.py, mais as notas de campo de
// ~/projetos/fable5skill/README.md e ~/projetos/timesmkt.
//
// O kie.ai é um agregador, como o fal: createTask -> polling. Diferenças que
// moram aqui:
//
//   - PAGO, e cobrado em CRÉDITOS, não em dólar direto. Não há API de preço por
//     modelo, então o orçamento sai de uma tabela offline (estimativa honesta) e
//     o CONSUMO REAL é medido pelo delta de saldo em /chat/credit. Ver a nota
//     sobre unidades em `actual()`.
//   - `aspect_ratio`, nunca pixels.
//   - NÃO aceita data URI em referência (nota de campo medida): a imagem precisa
//     ser uma URL pública. O Bench já sobe anexo pro storage do fal e recebe URL
//     pública, então o caminho normal da UI funciona.
//   - VERIFICADO contra a API viva (2026-08-16): o polling é
//     `GET /api/v1/jobs/recordInfo` (200). O `getTask` que aparece no
//     ~/projetos/timesmkt/media/image-generator.js devolve 404 — está velho.

const BASE = "https://api.kie.ai";
const POLL_MS = 6000;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Preço estimado por geração, em US$. O kie.ai não publica preço por modelo em
// API nenhuma, então isto é tabela offline — rotulada como estimada, nunca como
// verificada. A tabela mora no gerador, junto da lista de modelos, para não
// existirem duas listas discordando.
import { PRECO_ESTIMADO as PRICE } from "./kie_sync.mjs";

function key() {
  const k = process.env.KIE_API_KEY;
  if (!k) throw new Error("KIE_API_KEY ausente. Ver ~/projetos/wifi/.env");
  return k;
}
const headers = () => ({ Authorization: `Bearer ${key()}`, "Content-Type": "application/json" });

async function credits() {
  try {
    const r = await fetch(`${BASE}/api/v1/chat/credit`, { headers: headers(), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.data === "number" ? d.data : null;
  } catch { return null; }
}

// O kie.ai responde HTTP 200 com um `code` interno diferente de 200 quando
// recusa. Tratar só o status HTTP deixaria a falha passar como sucesso.
function unwrap(payload, context) {
  if (payload?.code && Number(payload.code) !== 200) {
    throw new Error(`kie ${context} recusou (code ${payload.code}): ${String(payload.msg ?? "").slice(0, 200)}`);
  }
  return payload?.data ?? payload;
}

// Nota de campo MEDIDA: data URI não é aceito, só URL pública.
function publica(v) {
  return typeof v === "string" && /^https?:\/\//.test(v);
}

// Cada modelo do kie batiza o campo de imagem do seu jeito — `first_frame_url` e
// `last_frame_url` no Wan e no Seedance, `first_frame_image_url` no PixVerse,
// `image_input` no Nano Banana, `input_urls` no FLUX.2, `image_urls` no Kling.
// Antes tudo ia empacotado em `image_urls`, cortado em duas: o quadro final
// virava referência solta e o modelo recusava, ou pior, animava a imagem errada.
// Agora o que manda é o que o modelo DECLARA no registry.
function midiaDeclarada(modelo, input) {
  const campos = modelo?.media_inputs ?? [];
  const out = {};
  let ignoradas = 0;

  for (const campo of campos) {
    const bruto = input[campo.name];
    const lista = (Array.isArray(bruto) ? bruto : [bruto]).filter(Boolean);
    const validas = lista.filter(publica);
    ignoradas += lista.length - validas.length;
    if (!validas.length) continue;

    if (campo.arity === "multiple") {
      const teto = campo.limits?.max_items;
      out[campo.name] = teto ? validas.slice(0, teto) : validas;
    } else {
      out[campo.name] = validas[0];
    }
  }

  if (ignoradas > 0) console.warn(`kie: ${ignoradas} referência(s) ignorada(s) — o kie.ai exige URL pública, não aceita data URI nem caminho local`);
  return out;
}

async function submit(modelId, input, modelo) {
  const model = modelId.replace(/^kie\//, "");
  const declarados = modelo?.params ?? {};

  // Parametro so entra se o modelo declarar: mandar `aspect_ratio` para quem so
  // aceita `resolution` fazia o kie recusar. O `16:9` fixo de antes era o
  // exemplo disso — ele ia em TODA geracao, inclusive nas que nao o conhecem.
  const params = {};
  for (const [nome, valor] of Object.entries(input)) {
    if (nome === "prompt" || valor === undefined || valor === null || valor === "") continue;
    if (!declarados[nome]) continue;
    params[nome] = declarados[nome].type === "number" ? Number(valor) : valor;
  }

  const body = {
    model,
    input: {
      prompt: input.prompt,
      ...params,
      ...midiaDeclarada(modelo, input),
    },
  };

  // Saldo ANTES, para medir o consumo real depois. Se a consulta falhar, seguimos
  // sem medição — nunca bloquear a geração por causa do contador.
  const before = await credits();

  const res = await fetch(`${BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`kie createTask HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = unwrap(JSON.parse(text), "createTask");
  const taskId = data?.taskId ?? data?.task_id ?? data?.id;
  if (!taskId) throw new Error(`kie createTask sem taskId: ${text.slice(0, 200)}`);
  return { request_id: taskId, credits_before: before };
}

async function poll(modelId, handle, { onUpdate } = {}) {
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    await sleep(POLL_MS);
    let data;
    try {
      const r = await fetch(`${BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(handle.request_id)}`, {
        headers: headers(), signal: AbortSignal.timeout(60000),
      });
      const payload = await r.json();
      // `code 422 / recordInfo is null` acontece nos primeiros segundos, antes de
      // a tarefa aparecer. É espera, não falha.
      if (Number(payload?.code) === 422) { onUpdate?.({ status: "IN_QUEUE" }); continue; }
      data = unwrap(payload, "recordInfo");
    } catch (error) {
      // Uma falha de rede isolada não é a morte da tarefa: ela segue rodando do
      // lado do kie. Continuar consultando é mais correto que abortar.
      onUpdate?.({ status: "IN_QUEUE" });
      continue;
    }

    const state = String(data?.state ?? data?.status ?? "").toUpperCase();
    onUpdate?.({ status: state === "SUCCESS" ? "IN_PROGRESS" : "IN_QUEUE" });

    if (["SUCCESS", "COMPLETED", "DONE"].includes(state)) {
      let result = data?.resultJson;
      if (typeof result === "string") { try { result = JSON.parse(result); } catch { result = {}; } }
      const urls = result?.resultUrls ?? result?.urls ?? [];
      if (!urls.length) throw new Error("kie concluiu sem devolver URL de resultado.");
      const after = await credits();
      const used = handle.credits_before != null && after != null
        ? Number((handle.credits_before - after).toFixed(2))
        : null;
      const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(urls[0]);
      return {
        result: isVideo
          ? { video: { url: urls[0], content_type: "video/mp4" } }
          : { images: urls.map((url) => ({ url, content_type: "image/png" })) },
        billableUnits: used,
      };
    }
    if (["FAILED", "FAIL", "ERROR"].includes(state)) {
      throw new Error(`kie reportou falha: ${JSON.stringify(data).slice(0, 250)}`);
    }
  }
  throw new Error("kie: tempo esgotado (30 min).");
}

function priceOf(modelId) {
  return PRICE[modelId.replace(/^kie\//, "")] ?? null;
}

// Fabrica, e nao objeto solto, para o adapter poder consultar o que o MODELO
// declara — que e a unica forma de mandar cada imagem no campo certo.
export function createKieProvider({ modelById } = {}) {
  return {
  label: "kie.ai",
  availability: () => process.env.KIE_API_KEY
    ? { available: true }
    : { available: false, reason: "Falta KIE_API_KEY", hint: "Crie em kie.ai/api-key. Cobra em creditos." },
  // NAO aceita data URI (nota de campo medida): exige URL publica.
  accepts: { dataUri: false },
  submit: (modelId, input) => submit(modelId, input, modelById?.(modelId)),
  poll,
  quote: (modelId) => {
    const price = priceOf(modelId);
    if (price == null) return { cost: null, confidence: "unknown", basis: "sem preço na tabela offline do kie" };
    return { cost: price, confidence: "estimated (tabela offline)", basis: `~$${price} por geração (tabela local, o kie.ai não publica preço por API)` };
  },
  // O kie.ai cobra em CRÉDITOS e não expõe a taxa crédito->dólar. Medimos os
  // créditos realmente consumidos (delta de saldo) e os registramos, mas NÃO
  // inventamos uma conversão: o valor em dólar continua sendo a estimativa da
  // tabela, explicitamente rotulada. Misturar crédito com dólar no campo `cost`
  // corromperia o total gasto do ledger, que é o número que dá sentido ao app.
  actual: (modelId, billableUnits) => {
    const price = priceOf(modelId);
    if (price == null && billableUnits == null) return null;
    return {
      cost: price,
      confidence: billableUnits == null ? "estimated (tabela offline)" : "estimated (créditos medidos)",
      basis: billableUnits == null
        ? `~$${price} por geração (tabela local)`
        : `${billableUnits} créditos kie consumidos (medido pelo saldo) · ~$${price} pela tabela local`,
      unit: "credits",
      billable_units: billableUnits,
    };
  },
  };
}

export default createKieProvider;
