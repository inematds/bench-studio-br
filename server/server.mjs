// server.mjs — the whole "aggregator" in one file.
//
// This is the part Higgsfield charges a subscription for: hold the keys, know
// each model's schema, rewrite the prompt for the model you picked, submit,
// poll, and write down what it cost. None of it is hard. That is the point.
//
//   node server.mjs        (listens on :8787)
//
// Keys come from ~/.env. Nothing is ever sent to the browser.

import express from "express";
import multer from "multer";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createWriteStream, unlinkSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { readCatalogSync, syncFalCatalog } from "./catalog_sync.mjs";
import { createStore } from "./db.mjs";
import { loadOrBuildCapabilityManifest } from "./build_capabilities.mjs";
import { agnesProvider } from "./providers/agnes.mjs";
import { createInemaimgProvider } from "./providers/inemaimg.mjs";
import { kieProvider } from "./providers/kie.mjs";
import { createKlingProvider } from "./providers/kling.mjs";
import { mergeProviderModels } from "./providers/registry_merge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(process.env.BENCH_DATA_DIR || join(HERE, "..", "data"));
const LEDGER = join(DATA, "ledger.jsonl");
const OUTPUTS = join(DATA, "outputs");
const PREVIEWS = join(DATA, "previews");
const INPUTS = join(DATA, "inputs");
const DATABASE = join(DATA, "bench.db");
const PROJECTS = join(DATA, "projects");
const CATALOG_CACHE = join(DATA, "catalog-sync.json");
const CAPABILITY_FILE = join(HERE, "capabilities.json");
const SKILL_PACKAGES = join(HERE, "..", "integrations", "skills");
const MCP_NODE = existsSync("/opt/homebrew/bin/node") ? "/opt/homebrew/bin/node" : process.execPath;

// ---------------------------------------------------------------- env

function loadEnv() {
  const p = join(homedir(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const FAL_KEY = process.env.FAL_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!FAL_KEY) {
  console.error("No FAL_KEY in ~/.env. Add one from fal.ai/dashboard/keys and restart.");
  process.exit(1);
}

mkdirSync(DATA, { recursive: true });
mkdirSync(OUTPUTS, { recursive: true });
mkdirSync(PREVIEWS, { recursive: true });
mkdirSync(INPUTS, { recursive: true });
mkdirSync(PROJECTS, { recursive: true });
const store = createStore({ dbPath: DATABASE, legacyLedgerPath: LEDGER });
const migratedRows = store.migrateLegacyLedger();
if (migratedRows) console.log(`migrated ${migratedRows} legacy ledger rows into SQLite`);

// ---------------------------------------------------------------- registry + profiles + pricing

const registry = JSON.parse(readFileSync(join(HERE, "registry.json"), "utf8"));

// Modelos de providers não-fal entram aqui — antes do byId e antes do manifesto
// de capabilities, senão a validação de referências de /api/generate rejeita
// todos os anexos desses modelos.
mergeProviderModels(registry);

const byId = new Map(registry.models.map((m) => [m.id, m]));
let CATALOG_SYNC = readCatalogSync(CATALOG_CACHE);
let catalogSyncPromise = null;

async function refreshCatalogDiscovery() {
  if (catalogSyncPromise) return catalogSyncPromise;
  // Only the fal roster is compared against fal's live catalog. Agnes/local
  // models are not fal endpoints, so their absence there is not staleness.
  catalogSyncPromise = syncFalCatalog({ key: FAL_KEY, registry: { ...registry, models: falModels() }, cachePath: CATALOG_CACHE })
    .then((result) => {
      CATALOG_SYNC = result;
      store.recordCatalogSync(result);
      console.log(`catalog sync: ${result.relevant_active_endpoints} relevant active endpoints, ${result.new_endpoint_count} outside the production roster`);
      return result;
    })
    .finally(() => { catalogSyncPromise = null; });
  return catalogSyncPromise;
}

// Prompt profiles are merged from every file the research agents wrote, so
// adding a model's research is just dropping a JSON file in profiles/.
function listProfiles() {
  const dir = join(HERE, "profiles");
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

let PROFILES = {};
let PRICING = {};
function reloadKnowledge() {
  PROFILES = {};
  for (const f of listProfiles()) {
    if (!f.endsWith(".json") || f === "pricing.json") continue;
    try {
      Object.assign(PROFILES, JSON.parse(readFileSync(join(HERE, "profiles", f), "utf8")));
    } catch (e) { console.warn(`profile ${f}: ${e.message}`); }
  }
  const pp = join(HERE, "profiles", "pricing.json");
  PRICING = existsSync(pp) ? JSON.parse(readFileSync(pp, "utf8")) : {};
  console.log(`knowledge: ${Object.keys(PROFILES).length} prompt profiles, ${Object.keys(PRICING).filter(k=>k[0]!=="_").length} priced models`);
}
reloadKnowledge();
const CAPABILITIES = loadOrBuildCapabilityManifest({
  registry,
  profiles: PROFILES,
  path: CAPABILITY_FILE,
});
const capabilityById = new Map(CAPABILITIES.models.map((model) => [model.model_id, model]));
const projectProcesses = new Map();
const CREATIVE_REFERENCES = {
  website: process.env.BENCH_WEBSITE_REFERENCE || null,
  document: process.env.BENCH_DOCUMENT_REFERENCE || null,
};

function projectSlug(value) {
  return String(value || "untitled")
    .toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "untitled";
}

function publicProject(project) {
  if (!project) return null;
  const entryName = project.entry_file?.split("/").at(-1);
  const artifactName = project.artifact_file?.split("/").at(-1);
  const bundleUrl = project.kind === "website" && project.status === "complete"
    ? `/api/projects/${project.id}/bundle`
    : null;
  return {
    ...project,
    output_dir: undefined,
    entry_file: entryName ? `/projects/${project.id}/${entryName}` : null,
    artifact_file: artifactName ? `/projects/${project.id}/${artifactName}` : null,
    bundle_url: bundleUrl,
  };
}

function startProjectBuild(project) {
  const requestPath = join(project.output_dir, "request.json");
  const request = {
    id: project.id,
    kind: project.kind,
    title: project.title,
    slug: projectSlug(project.title),
    prompt: project.prompt,
    template: project.template,
    model: project.model,
    reasoning: project.reasoning,
    output_dir: project.output_dir,
    reference_path: CREATIVE_REFERENCES[project.kind] && existsSync(CREATIVE_REFERENCES[project.kind])
      ? CREATIVE_REFERENCES[project.kind]
      : null,
  };
  writeFileSync(requestPath, JSON.stringify(request, null, 2));
  const child = spawn(process.execPath, [join(HERE, "project_runner.mjs"), requestPath], {
    cwd: project.output_dir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  projectProcesses.set(project.id, child);
  let stdout = "";
  let stderr = "";
  store.updateProject(project.id, { status: "running", stage: "Starting Codex", progress: 3 });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const lines = stdout.split(/\r?\n/);
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      const match = line.match(/^BENCH_STAGE:(\d+):(.*)$/);
      if (!match) continue;
      const current = store.getProject(project.id);
      if (!current || current.status !== "running") continue;
      const progress = Number(match[1]);
      const stage = match[2].trim();
      store.updateProject(project.id, {
        progress,
        stage,
        stages: [...(current?.stages ?? []), { progress, stage, at: new Date().toISOString() }].slice(-20),
      });
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-12_000); });
  child.on("close", (code) => {
    projectProcesses.delete(project.id);
    // Cancellation is a deliberate terminal state. The SIGTERM used by the
    // cancel route also emits `close`; never reinterpret that exit as failure.
    if (store.getProject(project.id)?.status === "cancelled") return;
    if (code !== 0) {
      const message = stderr.split(/\r?\n/).filter(Boolean).at(-1) || `Build exited with status ${code}`;
      store.updateProject(project.id, { status: "failed", stage: "Build stopped", error: message.slice(0, 1200) });
      return;
    }
    try {
      const result = JSON.parse(readFileSync(join(project.output_dir, "result.json"), "utf8"));
      store.updateProject(project.id, {
        status: "complete", stage: "Complete", progress: 100,
        entry_file: result.entry_file,
        artifact_file: result.artifact_file,
        preview_url: project.kind === "website" ? `/projects/${project.id}/index.html` : `/projects/${project.id}/document.html`,
      });
    } catch (error) {
      store.updateProject(project.id, { status: "failed", stage: "Artifact missing", error: error.message });
    }
  });
}

// ---------------------------------------------------------------- cost
//
// Two layers, and the second one is why this counter is trustworthy:
//
//   1. ESTIMATE, before you press go, from fal's live unit price and the params
//      you picked. This is what fills the "this will cost" preview.
//   2. ACTUAL, after it finishes. fal returns the real billed quantity in the
//      `x-fal-billable-units` response header, already denominated in whatever
//      unit that model bills in. actual = billable_units * unit_price.
//
// So the ledger records what fal charged, not what we guessed. Rows are tagged
// verified or estimated, and the UI says which.

// Live unit prices, pulled from fal at startup. No hardcoded price table.
let LIVE_PRICES = {}; // endpoint_id -> { unit_price, unit, currency }
let BILLING_CACHE = null;

const PRICE_CACHE = join(DATA, "prices.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFalBilling({ force = false } = {}) {
  if (!force && BILLING_CACHE && Date.now() - BILLING_CACHE.fetched_at_ms < 60000) return BILLING_CACHE;
  const topUpUrl = "https://fal.ai/dashboard/billing";
  try {
    const response = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    if (response.status === 401 || response.status === 403) {
      BILLING_CACHE = {
        available: false,
        reason: "The current fal key can generate media but cannot read account billing.",
        top_up_url: topUpUrl,
        fetched_at: new Date().toISOString(),
        fetched_at_ms: Date.now(),
      };
      return BILLING_CACHE;
    }
    if (!response.ok) throw new Error(`fal billing HTTP ${response.status}`);
    const payload = await response.json();
    BILLING_CACHE = {
      available: true,
      account: payload.username ?? null,
      current_balance: payload.credits?.current_balance ?? null,
      currency: payload.credits?.currency ?? "USD",
      top_up_url: topUpUrl,
      fetched_at: new Date().toISOString(),
      fetched_at_ms: Date.now(),
    };
    return BILLING_CACHE;
  } catch (error) {
    return {
      available: false,
      reason: "Balance is temporarily unavailable. You can still add credits securely on fal.",
      top_up_url: topUpUrl,
      fetched_at: new Date().toISOString(),
      fetched_at_ms: Date.now(),
    };
  }
}

function readPriceCache() {
  if (!existsSync(PRICE_CACHE)) return {};
  try {
    return JSON.parse(readFileSync(PRICE_CACHE, "utf8"));
  } catch (e) {
    console.warn(`price cache unreadable: ${e.message}`);
    return {};
  }
}

// fal rate-limits this endpoint hard, so: small chunks, a pause between them,
// backoff on 429, and a disk cache so a throttled start still boots priced.
async function fetchLivePrices(ids) {
  const out = readPriceCache();

  for (let i = 0; i < ids.length; i += 5) {
    const chunk = ids.slice(i, i + 5);
    const qs = chunk.map((id) => `endpoint_id=${encodeURIComponent(id)}`).join("&");

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(`https://api.fal.ai/v1/models/pricing?${qs}`, {
          headers: { Authorization: `Key ${FAL_KEY}` },
        });
        if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
        if (!r.ok) { console.warn(`pricing ${r.status} on ${chunk[0]}`); break; }
        const j = await r.json();
        for (const p of j.prices ?? []) out[p.endpoint_id] = p;
        break;
      } catch (e) {
        await sleep(800 * (attempt + 1));
      }
    }
    await sleep(900);
  }

  try { writeFileSync(PRICE_CACHE, JSON.stringify(out, null, 2)); } catch {}
  return out;
}

// Units whose quantity cannot be predicted from the request. Anything billed
// in these gets no pre-run quote.
const OPAQUE_UNITS = new Set(["units", "compute seconds"]);

// How many billable units this request is likely to consume, given fal's unit.
function estimateUnits(modelId, params, unit) {
  const n = Number(params.num_images ?? 1) || 1;
  switch (unit) {
    case "megapixels":
      // fal rounds megapixels UP to the next whole unit, per model docs. A
      // 1024x1024 image is 1.048 MP and bills as 2. Skipping this undercounts.
      return Math.ceil(megapixels(params)) * n;
    case "seconds":
      return durationSeconds(modelId, params);
    case "images":
      return n;
    case "requests":
    case "generations":
      return 1;
    default:
      return 1;
  }
}

function estimateCost(modelId, params) {
  const live = LIVE_PRICES[modelId];
  const fallback = PRICING[modelId];
  if (!live && !fallback) return { cost: null, confidence: "unknown", basis: "no pricing available" };

  if (live) {
    // Some endpoints bill in an opaque "units" that has no relation to any
    // parameter you can see. Seedance reference billed 108.9 units on a 5
    // second clip, so a 1-unit guess would have been out by 100x. Refuse to
    // quote rather than quote a number that is wrong.
    if (OPAQUE_UNITS.has(live.unit)) {
      return {
        cost: null,
        confidence: "unquotable",
        basis: `billed per ${live.unit} at $${live.unit_price}, quantity is only known after the run`,
        unit: live.unit,
        unit_price: live.unit_price,
      };
    }
    const units = estimateUnits(modelId, params, live.unit);
    return {
      cost: Number((live.unit_price * units).toFixed(4)),
      confidence: "estimated",
      basis: `${units} ${live.unit} x $${live.unit_price}`,
      unit: live.unit,
      unit_price: live.unit_price,
    };
  }
  // researched table, only used if fal's pricing API is unreachable
  return {
    cost: fallback.price ?? null,
    confidence: "estimated (offline table)",
    basis: `${fallback.unit} @ $${fallback.price}`,
  };
}

// The real number. Called after the job completes, using the header fal sends.
function actualCost(modelId, billableUnits) {
  const live = LIVE_PRICES[modelId];
  if (!live || billableUnits == null) return null;
  return {
    cost: Number((live.unit_price * billableUnits).toFixed(4)),
    confidence: "verified",
    basis: `${billableUnits} ${live.unit} x $${live.unit_price} (billed by fal)`,
    unit: live.unit,
    unit_price: live.unit_price,
    billable_units: billableUnits,
  };
}

function durationSeconds(modelId, params) {
  const m = byId.get(modelId);
  const d = m?.params?.duration;
  const raw = params.duration ?? d?.default ?? d?.enum?.[0] ?? 5;
  const num = parseFloat(String(raw));
  return Number.isFinite(num) ? num : 5;
}

// fal's named size presets, so a megapixel-billed model can be priced before
// the request goes out rather than after.
const SIZE_PRESETS = {
  square_hd:        [1024, 1024],
  square:           [512, 512],
  portrait_4_3:     [768, 1024],
  portrait_16_9:    [576, 1024],
  landscape_4_3:    [1024, 768],
  landscape_16_9:   [1024, 576],
};

function megapixels(params) {
  const s = params.image_size;
  if (s && typeof s === "object" && s.width && s.height) return (s.width * s.height) / 1e6;
  if (typeof s === "string" && SIZE_PRESETS[s]) {
    const [w, h] = SIZE_PRESETS[s];
    return (w * h) / 1e6;
  }
  if (params.width && params.height) return (params.width * params.height) / 1e6;
  return 1.048; // model default is almost always 1024x1024
}

// ---------------------------------------------------------------- ledger

function appendLedger(row) {
  return store.addGeneration(row);
}

function readLedger() {
  return store.listGenerations(500);
}

function spendSummary() {
  return store.spendSummary();
}

// ---------------------------------------------------------------- prompt optimizer

// Rewrite a casual idea into a prompt shaped for the specific model, using the
// researched profile. This is the piece Higgsfield calls a "pre-trained backend".
function findProfile(modelId) {
  if (PROFILES[modelId]) return PROFILES[modelId];
  // Fall back to a same-family, same-modality profile. Endpoint ids churn every
  // few months; the way a family wants to be prompted moves much slower.
  const m = byId.get(modelId);
  if (!m) return null;
  const wantVideo = m.kind === "video";
  const candidates = Object.entries(PROFILES).filter(([id, p]) => {
    const isVideo = String(p.modality ?? "").includes("video");
    if (isVideo !== wantVideo) return false;
    return sameFamily(id, modelId);
  });
  return candidates[0]?.[1] ?? null;
}

// Families, as alias groups. One vendor can appear under several names across
// endpoint generations (minimax/hailuo/h3 are all the same model line), so a
// single-token match would miss the very case the fallback exists for.
const FAMILIES = {
  gemini:   ["nano-banana"],
  openai:   ["gpt-image"],
  seedream: ["seedream"],
  qwen:     ["qwen-image"],
  flux:     ["flux"],
  recraft:  ["recraft"],
  grok:     ["grok"],
  kling:    ["kling"],
  seedance: ["seedance"],
  hailuo:   ["hailuo", "minimax", "/h3/"],
  wan:      ["wan"],
  ltx:      ["ltx"],
  veo:      ["veo"],
  hunyuan:  ["hunyuan"],
};

function familyOf(id) {
  const s = `/${id}/`;
  for (const [fam, tokens] of Object.entries(FAMILIES)) {
    if (tokens.some((t) => s.includes(t))) return fam;
  }
  return null;
}

function sameFamily(a, b) {
  const fa = familyOf(a);
  return Boolean(fa) && fa === familyOf(b);
}

function shotDirectionLines(shotSettings = {}) {
  return Object.entries(shotSettings)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value).slice(0, 180)}`);
}

function imageInputForModel(model) {
  if (model?.image_input?.name && model.image_input.arity) return model.image_input;
  if (model?.image_param && model.accepts_image) {
    return { name: model.image_param, arity: model.accepts_image };
  }
  return null;
}

async function optimizePrompt({ idea, modelId, format, hasReference, refCount = 0, params = {}, shotSettings = {} }) {
  const profile = findProfile(modelId);
  const model = byId.get(modelId);
  if (!profile) return { prompt: idea, optimized: false, reason: "no profile for this model yet" };
  if (!GOOGLE_API_KEY) return { prompt: idea, optimized: false, reason: "no GOOGLE_API_KEY for the rewriter" };

  const formatBrief = format === "ugc"
    ? ugcBrief({ model, modelId, hasReference, refCount })
    : FORMATS[format]?.brief ?? "";

  // The aspect ratio, duration and resolution are sent as real parameters, so
  // the prompt must not argue with them. Writing "vertical 9:16" into a prompt
  // submitted at 4:5 is how you get a fight between the text and the request.
  const settingsBrief = Object.entries(params)
    .filter(([k, v]) => v !== undefined && v !== "" &&
      ["aspect_ratio", "duration", "resolution", "image_size", "fps", "num_images"].includes(k))
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
  const refRules = hasReference
    ? (profile.reference_image_prompt_rules ?? []).join("\n- ")
    : "";
  const directionLines = shotDirectionLines(shotSettings);

  const sys = `You rewrite a casual creative idea into ONE prompt tuned for a specific generative model.

MODEL: ${model?.label ?? modelId} (${model?.vendor ?? "?"}), ${profile.modality ?? model?.lane}

HOW THIS MODEL WANTS TO BE PROMPTED:
${profile.prompt_style ?? ""}

STRUCTURE TO FOLLOW:
${profile.structure_template ?? ""}

TARGET LENGTH: ${(profile.ideal_length_words ?? [30, 80]).join(" to ")} words

DO:
- ${(profile.do ?? []).join("\n- ")}

DO NOT:
- ${(profile.dont ?? []).join("\n- ")}
${profile.motion_vocabulary ? `\nCAMERA VOCABULARY THIS MODEL RESPONDS TO:\n- ${profile.motion_vocabulary.join("\n- ")}` : ""}
${formatBrief ? `\nFORMAT THE USER PICKED:\n${formatBrief}` : ""}
${directionLines.length ? `\nCREATIVE DIRECTION SELECTED BY THE USER:\n- ${directionLines.join("\n- ")}\nUse these choices to make the prompt concrete. Do not mention the control labels or describe this as a preset.` : ""}
${settingsBrief ? `\nSETTINGS ALREADY LOCKED ON THE REQUEST. Never contradict these in the prompt text, and never restate them as words:\n${settingsBrief}` : ""}
${refRules ? `\n${refCount === 1 ? "EXACTLY ONE reference image is attached. Never refer to a second, third or 'background' image; anything not in that one image must be described in words instead." : `EXACTLY ${refCount} reference images are attached, in order.`}\nThese rules are mandatory:\n- ${refRules}` : ""}

Return ONLY the rewritten prompt. No preamble, no quotes, no explanation, no markdown.`;

  const body = {
    contents: [{ role: "user", parts: [{ text: `Idea: ${idea}` }] }],
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: {
      temperature: 0.7,
      // Thinking tokens are drawn from this same budget, so a tight cap here
      // truncates the answer mid-sentence. Give it room and turn thinking off,
      // since this is a rewrite task with the rules already supplied.
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { prompt: idea, optimized: false, reason: `rewriter HTTP ${res.status}` };
  }
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  if (!text) return { prompt: idea, optimized: false, reason: "rewriter returned nothing" };
  return { prompt: text, optimized: true, profile_used: profile.family ?? modelId };
}

// The format presets. This is the Marketing-Studio layer, except you can read it.
const FORMATS = {
  none: { label: "Freeform", brief: "" },
  ugc: {
    label: "UGC",
    brief:
      "A direct-response creator ad, built as one believable social-native beat rather than a polished commercial. Keep one creator, one product, one setting, and one clear action. Use phone-native framing, natural light, slight handheld imperfection, and a real reaction. If the idea includes a spoken line, keep it short, conversational, and faithful to the user's words; never invent a product claim. Use the actual aspect ratio and duration controls instead of restating them in the prompt. For a short clip, make the beat: hook or problem, product interaction or proof, then a natural reaction. Do not write a montage, scene changes, captions, or extra people unless the user asks for them.",
  },
  unboxing: {
    label: "Unboxing",
    brief:
      "Top-down or over-the-shoulder view of hands opening packaging and revealing the product. Tactile close-ups of the box, the lid, the reveal. Warm domestic surface, shallow depth of field, no faces needed.",
  },
  hypermotion: {
    label: "Hyper Motion",
    brief:
      "High-energy product film. Fast camera moves, whip transitions, macro detail shots, the product suspended or rotating, dramatic rim lighting against a dark ground. Every second changes. Premium launch-film energy.",
  },
  tvspot: {
    label: "TV Spot",
    brief:
      "Cinematic commercial framing. Locked-off or slow dolly, filmic color, a single clear hero composition, product centered and lit like a luxury ad. Calm, expensive, confident.",
  },
  product: {
    label: "Product Still",
    brief:
      "Clean studio product photography. Seamless sweep background, controlled soft lighting with one crisp specular highlight, product perfectly in focus and centered, catalogue-grade.",
  },
  poster: {
    label: "Ad with Headline",
    brief:
      "A social-ready advertisement image with legible on-image headline text. Leave deliberate empty space for the headline, keep the type short and high-contrast, and make sure the words are spelled correctly and fully visible.",
  },
};

// UGC is a shared creative intent, not a shared prompt dialect. These adapters
// carry the documented shape of each family into the common UGC brief so the
// rewriter can keep the workflow simple without flattening model differences.
const UGC_FAMILY_RULES = {
  flux: "For an image, make this a candid phone or 2000s digicam creator frame: one person, one product, one readable gesture, natural indoor light, and enough separation for the product to read. Use short positive prose, subject first, and never write negative instructions because FLUX has no negative prompt.",
  gemini: "For an image, write a natural scene description with the creator and product roles explicit. If references are attached, identify each by role and preserve the product or face instead of re-describing it. Keep any new on-image copy short and quote it exactly only when requested.",
  openai: "For an image, use a plain designer brief: deliverable, creator action, product placement, composition, and lighting. Keep it compact. Avoid dense copy, pixel-exact layout promises, or a long cinematic paragraph; GPT Image is better at the visual than precise ad typography.",
  recraft: "For an image, use a concise controlled description. State the creator, product, composition, and visual style. If a brand layout or headline matters, specify the hierarchy and exact short text directly; keep the rest of the scene simple.",
  seedream: "For an image, describe one candid creator moment with a clear product action and simple social composition. Keep the scene concrete and avoid stacking many props, claims, or text elements.",
  qwen: "For an image, keep an entity → action → scene → style order. Make the creator's gesture and the product's position explicit, but do not turn the prompt into a list of ad buzzwords.",
  kling: "For video, follow Subject → Movement → Scene → Camera → Lighting. Make one primary camera move and one human action fit the requested duration. With a reference image, prompt motion and delivery only; do not redraw the anchored person's appearance or product.",
  veo: "For video, explicitly describe the subject, action, camera framing or move, natural lighting, and optional audio. A short spoken line may be included when the endpoint supports audio. Use positive phrasing instead of a negative prompt, and keep the performance natural rather than over-directed.",
  seedance: "For video, write a chronological action beat. Use explicit shot changes or time ranges only when the requested duration can support them; otherwise keep one hook → proof → reaction beat. When references are attached, keep their roles explicit and use the model's reference identifiers only when they are available in the request.",
  hailuo: "For video, write one flowing paragraph with one creator action and one camera move. Keep delivery natural and do not overpack the clip. With a reference image, describe motion and camera only and keep the product or person unchanged.",
  wan: "For video, follow Entity/Reference → Action → Scene → Lines → Sound. For a reference request, identify the uploaded image as Image 1 when more than one reference exists. Say 'Generate single shot' for a short one-beat UGC clip; use timestamped multi-shot structure only when the user asks for a multi-shot ad.",
  ltx: "For video, write one chronological paragraph under 200 words: creator action, product interaction, camera movement, then atmosphere or audio if supported. One flowing take is more reliable than a montage or a list of shots.",
  grok: "For video, use a concise natural-language request with one clear creator action and one camera idea. For reference-to-video, say what the reference should preserve and what should change; never mix a first-frame image and reference-image mode in the same request.",
};

function ugcBrief({ model, modelId, hasReference, refCount }) {
  const family = familyOf(modelId);
  const isVideo = model?.kind === "video";
  const lane = model?.lane ?? "t2i";
  const referenceNote = hasReference
    ? `REFERENCE MODE: ${refCount === 1 ? "one reference image" : `${refCount} reference images`} is attached. Preserve the anchored subject and product. For image-to-video or reference-to-video, describe only the action, expression, camera, and time-based change unless the model-specific rule below explicitly requires more.`
    : "No reference image is attached. The prompt must establish the creator, product, setting, and action itself.";
  const laneNote = lane === "r2v"
    ? "This is a reference-to-video lane: preserve the product or creator from the reference and stage a single believable UGC delivery moment around it."
    : lane === "i2v"
    ? "This is an image-to-video lane: treat the uploaded image as the starting frame and prompt motion, camera, expression, and product interaction rather than inventing a new look."
    : lane === "i2i"
    ? "This is an image-edit lane: make the requested edit explicit and keep the creator/product identity stable."
    : "This is a text-to-generation lane: establish one creator, one product, one setting, and one ad beat from scratch.";
  const mediumNote = isVideo
    ? "MEDIUM: VIDEO. Do not write a full 30-second script. Return one short filmable beat that can fit the selected duration."
    : "MEDIUM: IMAGE. Create the key UGC frame or thumbnail, not a spoken script. Show the creator's expression, product interaction, and phone-native context in one still.";
  return [
    FORMATS.ugc.brief,
    mediumNote,
    laneNote,
    referenceNote,
    UGC_FAMILY_RULES[family] ?? "Use plain, concrete language: one creator, one product action, one setting, one camera idea, and one natural payoff.",
  ].join("\n\n");
}

// ---------------------------------------------------------------- fal calls

const FAL_QUEUE = "https://queue.fal.run";

async function falSubmit(modelId, input) {
  const res = await fetch(`${FAL_QUEUE}/${modelId}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal submit ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

function publicProviderError(error, context = "generation") {
  const raw = String(error?.message ?? error ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("exhausted balance") || lower.includes("user is locked")) {
    return context === "upload"
      ? "Your fal balance is empty, so the reference cannot be uploaded. Add credits and try again."
      : "Your fal balance is empty. Add credits and try this generation again.";
  }
  if (lower.includes("content_policy_violation")) {
    return "The model declined this request because of its content policy. Adjust the prompt or reference and try again.";
  }
  if (/\b401\b|\b403\b/.test(lower)) {
    return "fal rejected the current API credentials. Check the configured key and account access.";
  }
  if (/\b422\b/.test(lower)) {
    return "This model could not accept one of the selected settings. Review the model controls and try again.";
  }
  // Antes, tudo que não casasse com os casos acima virava "a geração não pôde
  // ser iniciada, tente de novo". Isso escondeu dois bugs reais nesta sessão
  // (`flux2-klein/edit` -> 404 e `agnes-image-2.1-flash/edit` -> model_not_found):
  // a tela dizia "tente de novo" para um erro que nunca ia melhorar tentando.
  // Os adapters escrevem mensagens específicas de propósito — repassá-las é o
  // ponto. Só a chave é redigida, porque ela nunca deve sair daqui.
  const safe = raw
    .replace(/(Key|Bearer)\s+[A-Za-z0-9._:-]{8,}/gi, "$1 [redigida]")
    .replace(/([?&](api_?key|token|key)=)[^&\s]+/gi, "$1[redigida]")
    .trim();
  if (safe) return safe.slice(0, 400);
  return context === "upload"
    ? "The reference could not be uploaded. Please try again."
    : "The generation could not be started. Please try again.";
}

// Status/result live under the base model path, not the sub-path.
function baseOf(modelId) {
  const parts = modelId.split("/");
  return parts.length > 2 ? `${parts[0]}/${parts[1]}` : modelId;
}

async function falPoll(modelId, requestId, { onUpdate } = {}) {
  const base = baseOf(modelId);
  const statusUrl = `${FAL_QUEUE}/${base}/requests/${requestId}/status`;
  const resultUrl = `${FAL_QUEUE}/${base}/requests/${requestId}`;
  const started = Date.now();
  const TIMEOUT_MS = 12 * 60 * 1000;

  while (Date.now() - started < TIMEOUT_MS) {
    const r = await fetch(statusUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
    if (!r.ok) throw new Error(`fal status ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const s = await r.json();
    onUpdate?.(s);
    if (s.status === "COMPLETED") {
      const rr = await fetch(resultUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
      if (!rr.ok) throw new Error(`fal result ${rr.status}: ${(await rr.text()).slice(0, 300)}`);
      // Read the header BEFORE the body; this is the real billed quantity.
      const raw = rr.headers.get("x-fal-billable-units");
      const billableUnits = raw == null ? null : Number(raw);
      return {
        result: await rr.json(),
        billableUnits: Number.isFinite(billableUnits) ? billableUnits : null,
      };
    }
    if (s.status === "FAILED" || s.status === "ERROR") {
      throw new Error(`generation failed: ${JSON.stringify(s).slice(0, 400)}`);
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("timed out after 12 minutes");
}

// ---------------------------------------------------------------- providers
//
// One interface, N backends. Ported from ~/projetos/videoanima-skill/provedores.py,
// which already runs this exact shape in production (agnes | inemaimg | kie).
// Its rule holds here too:
//
//   "As armadilhas MEDIDAS de cada API moram no adaptador dela, nunca no
//    nucleo -- sao especificas do provedor."
//
// So retries, poll spacing, param quirks and auth live inside an adapter.
// Everything the core does -- input validation, the ledger, mirroring outputs
// -- stays provider-agnostic and is written exactly once.
//
// Contract, per adapter:
//   submit(modelId, input)            -> { request_id, ... }   provider-specific handle
//   poll(modelId, handle, {onUpdate}) -> { result, billableUnits }
//   quote(modelId, input)             -> { cost, confidence, basis, ... } | before the run
//   actual(modelId, billableUnits)    -> same shape | null     | after the run
//
// A model declares its backend with `provider` in the registry. Absent means
// "fal", so the 37 curated fal routes keep working with no registry change.

const PROVIDERS = {
  fal: {
    label: "fal.ai",
    submit: (modelId, input) => falSubmit(modelId, input),
    poll: (modelId, handle, opts) => falPoll(modelId, handle.request_id, opts),
    quote: (modelId, input) => estimateCost(modelId, input),
    actual: (modelId, billableUnits) => actualCost(modelId, billableUnits),
  },
  agnes: agnesProvider,
  // Local: grava o PNG direto em OUTPUTS, por isso precisa saber onde é.
  inemaimg: createInemaimgProvider({ outputsDir: OUTPUTS }),
  kie: kieProvider,
  // O adapter precisa saber quais params o modelo declara: mandar flag que o
  // modelo nao declara faz o CLI recusar.
  kling: createKlingProvider({ modelById: (id) => byId.get(id) }),
};

const DEFAULT_PROVIDER = "fal";
const providerOf = (model) => model?.provider ?? DEFAULT_PROVIDER;
function adapterFor(model) {
  const name = providerOf(model);
  const adapter = PROVIDERS[name];
  if (!adapter) throw new Error(`unknown provider ${name} for ${model?.id}`);
  return adapter;
}
// fal-only chores (live pricing, catalog staleness) must never be handed a
// foreign model id, or fal answers "unknown endpoint" for something that was
// never its endpoint to begin with.
const falModels = () => registry.models.filter((m) => providerOf(m) === "fal");

async function falUpload(buffer, filename, contentType) {
  // fal's storage: ask for a signed upload URL, PUT the bytes, get back a
  // public file_url you can hand to any model as image_url.
  const init = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: filename, content_type: contentType }),
  });
  if (!init.ok) throw new Error(`upload initiate ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const { upload_url, file_url } = await init.json();
  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!put.ok) throw new Error(`upload put ${put.status}`);
  return file_url;
}

const CONTENT_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "application/pdf": ".pdf",
};

function mediaTypeFor(contentType = "") {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "document";
  return "file";
}

function safeExtension(filename, contentType) {
  const extension = extname(filename ?? "").toLowerCase();
  if (/^\.[a-z0-9]{1,6}$/.test(extension)) return extension;
  return CONTENT_EXTENSIONS[contentType] ?? ".bin";
}

function localUploadCopy(file) {
  const uploadId = randomUUID();
  const filename = `${Date.now()}-${uploadId.slice(0, 8)}${safeExtension(file.originalname, file.mimetype)}`;
  const localPath = join(INPUTS, filename);
  writeFileSync(localPath, file.buffer);
  return {
    upload_id: uploadId,
    original_name: file.originalname,
    media_type: mediaTypeFor(file.mimetype),
    content_type: file.mimetype,
    size_bytes: file.size,
    local_path: localPath,
    local_url: `/inputs/${filename}`,
    created_at: new Date().toISOString(),
  };
}

async function mirrorRemoteAsset(remoteUrl, identity, position = 0) {
  const response = await fetch(remoteUrl);
  if (!response.ok || !response.body) throw new Error(`media download HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? null;
  const extension = safeExtension(new URL(remoteUrl).pathname, contentType);
  const safeIdentity = String(identity || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 90);
  const filename = `${safeIdentity}-${position}${extension}`;
  const localPath = join(OUTPUTS, filename);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(localPath));
  return { local_path: localPath, local_url: `/media/${filename}`, content_type: contentType };
}

async function mirrorOutputs(outputs, requestId) {
  const mirrored = [];
  for (let index = 0; index < outputs.length; index++) {
    const output = outputs[index];
    // Provider local (inemaimg e afins) já escreve o arquivo em disco: não há
    // nada remoto para espelhar. Espelhar mesmo assim faria o servidor baixar
    // de si próprio e guardar uma segunda cópia do mesmo PNG.
    if (output.local_path) { mirrored.push({ ...output, remote_url: output.remote_url ?? null }); continue; }
    try {
      const local = await mirrorRemoteAsset(output.url, requestId, index);
      mirrored.push({ ...output, ...local, remote_url: output.url });
    } catch (error) {
      console.warn(`media mirror failed for ${output.url}: ${error.message}`);
      mirrored.push({ ...output, remote_url: output.url, mirror_error: error.message });
    }
  }
  return mirrored;
}

async function backfillMediaMirrors() {
  const missing = store.missingOutputAssets(80);
  let mirrored = 0;
  for (const asset of missing) {
    try {
      const local = await mirrorRemoteAsset(asset.remote_url, asset.request_id || `legacy-${asset.generation_id}`, asset.position);
      store.updateAssetMirror(asset.id, {
        localPath: local.local_path,
        localUrl: local.local_url,
        contentType: local.content_type,
      });
      mirrored++;
    } catch (error) {
      console.warn(`legacy media mirror failed: ${error.message}`);
    }
  }
  if (mirrored) console.log(`mirrored ${mirrored} historical outputs locally`);
}

// ---------------------------------------------------------------- app

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use("/media", express.static(OUTPUTS, { fallthrough: false }));
app.use("/previews", express.static(PREVIEWS, { fallthrough: false }));
app.use("/inputs", express.static(INPUTS, { fallthrough: false }));
app.use("/projects", express.static(PROJECTS, { fallthrough: false, index: false }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 120 * 1024 * 1024 } });

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    models: registry.models.length,
    schema_source: registry.source,
    image_input_models: registry.models.filter((model) => imageInputForModel(model)).length,
    profiles: Object.keys(PROFILES).length,
    priced: Object.keys(PRICING).filter((k) => k[0] !== "_").length,
    catalog_synced_at: CATALOG_SYNC?.synced_at ?? null,
    discovered_new_endpoints: CATALOG_SYNC?.new_endpoint_count ?? null,
    persistence: "sqlite",
    storage: store.storageSummary(),
    rewriter: GOOGLE_API_KEY ? "gemini-3-flash-preview" : "disabled (no GOOGLE_API_KEY)",
  });
});

app.get("/api/models", (_req, res) => {
  res.json({
    generated_at: registry.generated_at,
    catalog_sync: CATALOG_SYNC,
    formats: Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label })),
    models: registry.models.map((m) => ({
      ...m,
      capabilities: capabilityById.get(m.id) ?? null,
      has_profile: Boolean(findProfile(m.id)),
      // live from fal, so a price change shows up without a code change
      pricing: LIVE_PRICES[m.id]
        ? { unit: LIVE_PRICES[m.id].unit, price: LIVE_PRICES[m.id].unit_price }
        : null,
    })),
  });
});

app.get("/api/capabilities", (_req, res) => {
  res.json({ ...CAPABILITIES, checks: store.capabilityChecks() });
});

app.get("/api/storage", (_req, res) => {
  res.json({
    engine: "SQLite",
    database: "data/bench.db",
    media_directory: "data/outputs",
    upload_directory: "data/inputs",
    ...store.storageSummary(),
  });
});

app.get("/api/projects", (req, res) => {
  const kind = ["website", "document"].includes(req.query.kind) ? req.query.kind : undefined;
  res.json({ rows: store.listProjects(kind).map(publicProject) });
});

app.get("/api/projects/:id", (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(publicProject(project));
});

app.get("/api/projects/:id/bundle", (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || project.kind !== "website" || project.status !== "complete") return res.status(404).json({ error: "Website bundle not found" });
  const files = ["index.html", "styles.css", "app.js"].filter((name) => existsSync(join(project.output_dir, name)));
  const payload = files.map((name) => ({ name, content: readFileSync(join(project.output_dir, name), "utf8") }));
  if (req.query.download === "1") {
    const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "website";
    res.attachment(`${slug}-source.zip`);
    res.type("application/zip");
    const archive = spawn("/usr/bin/zip", ["-q", "-j", "-", ...files], {
      cwd: project.output_dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    archive.on("error", (error) => {
      if (!res.headersSent) res.status(500).json({ error: `Could not package the website: ${error.message}` });
      else res.destroy(error);
    });
    archive.stdout.pipe(res);
    return;
  }
  res.json({
    project_id: project.id,
    title: project.title,
    files: payload,
  });
});

app.post("/api/projects", (req, res) => {
  const { kind, title, prompt, template = kind === "website" ? "immersive" : "editorial-report", model = "gpt-5.6-sol", reasoning = "low" } = req.body ?? {};
  if (!["website", "document"].includes(kind)) return res.status(400).json({ error: "kind must be website or document" });
  if (!String(title ?? "").trim()) return res.status(400).json({ error: "Give this project a title." });
  if (String(prompt ?? "").trim().length < 20) return res.status(400).json({ error: "Describe the audience, purpose, and desired look in a little more detail." });
  if (!/^gpt-[a-zA-Z0-9._-]+$/.test(model)) return res.status(400).json({ error: "Unsupported Codex model" });
  if (!["low", "medium"].includes(reasoning)) return res.status(400).json({ error: "Reasoning must be low or medium" });
  if (projectProcesses.size >= 2) return res.status(429).json({ error: "Two creative builds are already running. Let one finish first." });
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const outputDir = join(PROJECTS, id);
  mkdirSync(outputDir, { recursive: true });
  const now = new Date().toISOString();
  const project = store.createProject({
    id, kind, title: String(title).trim(), prompt: String(prompt).trim(), template,
    status: "queued", stage: "Queued", progress: 0, output_dir: outputDir,
    model, reasoning, stages: [], metadata: { engine: "Codex SDK", authentication: "cached ChatGPT login" },
    created_at: now, updated_at: now,
  });
  startProjectBuild(project);
  res.status(202).json(publicProject(store.getProject(id)));
});

app.post("/api/projects/:id/cancel", (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const child = projectProcesses.get(project.id);
  if (child?.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  projectProcesses.delete(project.id);
  res.json(publicProject(store.updateProject(project.id, { status: "cancelled", stage: "Cancelled", error: null })));
});

app.get("/api/creative-references", async (_req, res) => {
  const websiteUrl = process.env.BENCH_WEBSITE_REFERENCE_URL || null;
  let websiteLive = false;
  if (websiteUrl) {
    try { websiteLive = (await fetch(websiteUrl, { signal: AbortSignal.timeout(800) })).ok; } catch {}
  }
  const documentPath = CREATIVE_REFERENCES.document;
  const documentPdf = documentPath
    ? (documentPath.endsWith(".pdf") ? documentPath : documentPath.replace(/\.html$/, ".pdf"))
    : null;
  res.json({
    website: {
      name: "Local website reference",
      description: "Optional reference configured by the person running this studio.",
      preview_url: websiteLive ? websiteUrl : null,
    },
    document: {
      name: "Local document reference",
      description: "Optional reference configured by the person running this studio.",
      preview_url: documentPdf && existsSync(documentPdf) ? "/api/creative-references/document.pdf" : null,
    },
  });
});

app.get("/api/creative-references/document.pdf", (_req, res) => {
  const source = CREATIVE_REFERENCES.document;
  const path = source ? (source.endsWith(".pdf") ? source : source.replace(/\.html$/, ".pdf")) : null;
  if (!path || !existsSync(path)) return res.status(404).json({ error: "Reference PDF is unavailable" });
  res.sendFile(resolve(path));
});

app.get("/api/tooling", (_req, res) => {
  res.json({
    name: "Bench Studio",
    transport: "stdio",
    command: MCP_NODE,
    args: [join(HERE, "mcp.mjs")],
    environment: { BENCH_URL: `http://localhost:${PORT}` },
    skill: {
      name: "bench-studio",
      version: "0.2.0",
      download_url: "/api/tooling/skill",
      installs: {
        codex: "~/.codex/skills/bench-studio",
        claude_code: "~/.claude/skills/bench-studio",
      },
    },
    tools: ["list_models", "get_model_capabilities", "upload_media", "create_media", "list_results", "get_usage", "sync_models", "create_website", "create_document", "list_projects", "get_project"],
  });
});

app.get("/api/tooling/skill", (_req, res) => {
  const folder = join(SKILL_PACKAGES, "bench-studio");
  if (!existsSync(join(folder, "SKILL.md"))) {
    return res.status(404).json({ error: "The Bench skill package is unavailable" });
  }

  res.attachment("bench-studio-skill.zip");
  res.type("application/zip");
  const archive = spawn("/usr/bin/zip", ["-q", "-r", "-", "bench-studio"], {
    cwd: SKILL_PACKAGES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let archiveError = "";
  archive.stderr.setEncoding("utf8");
  archive.stderr.on("data", (chunk) => { archiveError += chunk; });
  archive.on("error", (error) => {
    if (!res.headersSent) res.status(500).json({ error: `Could not package the skill: ${error.message}` });
    else res.destroy(error);
  });
  archive.on("close", (code) => {
    if (code !== 0 && !res.destroyed) res.destroy(new Error(archiveError || `zip exited with ${code}`));
  });
  archive.stdout.pipe(res);
});

app.get("/api/catalog/status", (_req, res) => {
  res.json(CATALOG_SYNC ?? {
    synced_at: null,
    production_models: registry.models.length,
    new_endpoint_count: null,
    status: catalogSyncPromise ? "syncing" : "not_synced",
  });
});

app.post("/api/catalog/sync", async (_req, res) => {
  try { res.json(await refreshCatalogDiscovery()); }
  catch (error) { res.status(502).json({ error: String(error.message ?? error) }); }
});

app.get("/api/spend", (_req, res) => res.json(spendSummary()));

app.get("/api/fal/billing", async (req, res) => {
  const billing = await fetchFalBilling({ force: req.query.refresh === "1" });
  const { fetched_at_ms: _privateTimestamp, ...publicBilling } = billing;
  res.json(publicBilling);
});

// What will this cost, before I press go.
app.post("/api/quote", (req, res) => {
  const { modelId, params = {} } = req.body ?? {};
  if (!byId.has(modelId)) return res.status(400).json({ error: `unknown model ${modelId}` });
  // Pelo adapter, não por estimateCost: este último só sabe consultar a tabela
  // de preços do fal, e responderia "no pricing available" para um provider
  // gratuito — o oposto do que o ledger precisa mostrar.
  res.json(adapterFor(byId.get(modelId)).quote(modelId, params));
});

app.get("/api/ledger", (_req, res) => {
  // SQLite already returns newest first. Reversing this made the Results tab
  // and ledger lead with the oldest work, burying the generation just made.
  const rows = readLedger().slice(0, 200);
  res.json({ rows, summary: spendSummary() });
});

app.delete("/api/results/:id", (req, res) => {
  const removed = store.deleteGeneration(req.params.id);
  if (!removed) return res.status(404).json({ error: "Result not found" });

  const deletedFiles = [];
  const outputRoot = `${resolve(OUTPUTS)}/`;
  for (const asset of removed.assets) {
    const localPath = asset.local_path ? resolve(asset.local_path) : null;
    if (!localPath || !localPath.startsWith(outputRoot)) continue;
    try {
      if (existsSync(localPath)) {
        unlinkSync(localPath);
        deletedFiles.push(basename(localPath));
      }
    } catch (error) {
      console.warn(`could not delete local result ${basename(localPath)}: ${error.message}`);
    }

    const stem = basename(localPath, extname(localPath));
    for (const extension of [".jpg", ".jpeg", ".png", ".webp"]) {
      const previewPath = resolve(PREVIEWS, `${stem}${extension}`);
      if (!previewPath.startsWith(`${resolve(PREVIEWS)}/`)) continue;
      try {
        if (existsSync(previewPath)) {
          unlinkSync(previewPath);
          deletedFiles.push(basename(previewPath));
        }
      } catch (error) {
        console.warn(`could not delete result preview ${basename(previewPath)}: ${error.message}`);
      }
    }
  }

  res.json({
    ok: true,
    archive_id: removed.archive_id,
    deleted_files: deletedFiles.length,
    remote_copy_retained: true,
    summary: spendSummary(),
    storage: store.storageSummary(),
  });
});

app.post("/api/reload", (_req, res) => { reloadKnowledge(); res.json({ ok: true, profiles: Object.keys(PROFILES).length }); });

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const local = localUploadCopy(req.file);
    const url = await falUpload(req.file.buffer, req.file.originalname, req.file.mimetype);
    const record = { ...local, remote_url: url };
    store.recordUpload(record);
    res.json({
      url,
      remote_url: url,
      local_url: local.local_url,
      upload_id: local.upload_id,
      media_type: local.media_type,
      content_type: local.content_type,
      size_bytes: local.size_bytes,
      name: local.original_name,
    });
  } catch (e) {
    console.warn(`fal upload failed: ${String(e.message ?? e)}`);
    res.status(502).json({ error: publicProviderError(e, "upload") });
  }
});

app.post("/api/optimize", async (req, res) => {
  try {
    const { idea, modelId, format = "none", hasReference = false, refCount = 0, params = {}, shotSettings = {} } = req.body ?? {};
    if (!idea || !modelId) return res.status(400).json({ error: "idea and modelId required" });
    const model = byId.get(modelId);
    if ((hasReference || refCount > 0) && model && !imageInputForModel(model)) {
      const pair = model.pair ? byId.get(model.pair) : null;
      return res.status(400).json({
        error: pair
          ? `${model.label} cannot use a reference image. Use ${pair.label} for this reference instead.`
          : `${model.label} does not accept reference images. Choose an image-capable model.`,
      });
    }
    res.json(await optimizePrompt({
      idea, modelId, format, params,
      shotSettings,
      hasReference: hasReference || refCount > 0,
      refCount: refCount || (hasReference ? 1 : 0),
    }));
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) });
  }
});

// The main event. Streams progress back as newline-delimited JSON so the UI can
// show queue position instead of a dead spinner.
app.post("/api/generate", async (req, res) => {
  const { modelId, prompt, params = {}, referenceUrls = [], inputAssets = [], format = "none", rawIdea = null, shotSettings = {} } = req.body ?? {};
  const model = byId.get(modelId);
  if (!model) return res.status(400).json({ error: `unknown model ${modelId}` });
  if (!prompt) return res.status(400).json({ error: "prompt required" });

  // Never let a reference silently disappear. The client normally switches to
  // the paired image-capable endpoint, but this guard protects direct callers
  // and catches UI races before they become a paid generation.
  const imageInput = imageInputForModel(model);
  const capability = capabilityById.get(modelId);
  const inputSpecs = new Map((capability?.inputs ?? []).map((spec) => [spec.field, spec]));
  const normalizedAssets = inputAssets.length
    ? inputAssets
    : referenceUrls.map((url) => ({ url, field: imageInput?.name, media_type: "image" }));
  if (referenceUrls.length && !imageInput) {
    const pair = model.pair ? byId.get(model.pair) : null;
    return res.status(400).json({
      error: pair
        ? `${model.label} cannot use a reference image. Use ${pair.label} for this reference instead.`
        : `${model.label} does not accept reference images. Choose an image-capable model.`,
    });
  }
  for (const asset of normalizedAssets) {
    const spec = inputSpecs.get(asset.field);
    if (!asset.url || !asset.field || !spec) {
      return res.status(400).json({ error: `${model.label} cannot use the attached ${asset.media_type ?? "media"} in that input slot.` });
    }
    if (asset.media_type && spec.modality !== "mixed" && asset.media_type !== spec.modality) {
      return res.status(400).json({ error: `${asset.field} accepts ${spec.modality}, not ${asset.media_type}.` });
    }
  }
  for (const spec of inputSpecs.values()) {
    const count = normalizedAssets.filter((asset) => asset.field === spec.field).length;
    if (spec.arity === "single" && count > 1) {
      return res.status(400).json({ error: `${model.label} accepts one file in ${spec.field}. Remove ${count - 1} and try again.` });
    }
    if (spec.limits?.max_items && spec.arity === "multiple" && count > spec.limits.max_items) {
      return res.status(400).json({ error: `${model.label} accepts up to ${spec.limits.max_items} files in ${spec.field}.` });
    }
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  const send = (o) => res.write(JSON.stringify(o) + "\n");

  try {
    const directionLines = shotDirectionLines(shotSettings);
    const promptWithDirection = directionLines.length && format !== "none"
      ? `${prompt}\n\nCreative direction: ${directionLines.join("; ")}.`
      : prompt;
    const input = { prompt: promptWithDirection, ...params };

    // Several endpoints will "expand" your prompt server-side. The prompt we
    // just wrote follows that model's own documented rules, so letting the
    // vendor paraphrase it throws the research away. Off unless asked.
    if ("enable_prompt_expansion" in (model.params ?? {}) &&
        params.enable_prompt_expansion === undefined) {
      input.enable_prompt_expansion = false;
    }
    for (const spec of inputSpecs.values()) {
      const values = normalizedAssets.filter((asset) => asset.field === spec.field).map((asset) => asset.url);
      if (values.length) input[spec.field] = spec.arity === "multiple" ? values : values[0];
    }
    // never submit empty-string params, fal validates strictly
    for (const k of Object.keys(input)) {
      if (input[k] === "" || input[k] === null || input[k] === undefined) delete input[k];
    }

    const adapter = adapterFor(model);
    const pre = adapter.quote(modelId, input);
    send({ phase: "submitting", input, estimate: pre, provider: providerOf(model) });
    const q = await adapter.submit(modelId, input);
    for (const field of new Set(normalizedAssets.map((asset) => asset.field))) {
      store.recordCapabilityCheck({
        model_id: modelId,
        input_field: field,
        status: "submission-verified",
        source: "runtime",
        evidence: "fal accepted a real queued request containing this input field.",
        details: { request_id: q.request_id },
        verified_at: new Date().toISOString(),
      });
    }
    send({ phase: "queued", request_id: q.request_id });

    const { result, billableUnits } = await adapter.poll(modelId, q, {
      onUpdate: (s) => send({ phase: "status", status: s.status, queue_position: s.queue_position ?? null }),
    });

    // Prefer what the provider actually billed. Fall back to the estimate when
    // it does not report a billed quantity.
    const priced = adapter.actual(modelId, billableUnits) ?? pre;
    const { cost, confidence, basis } = priced;
    const outputs = await mirrorOutputs(extractUrls(result), q.request_id);
    const row = {
      ts: new Date().toISOString(),
      model: modelId,
      label: model.label,
      // Which backend actually ran and billed this. The same model can exist on
      // more than one route (fal vs direct), so the receipt has to say which.
      provider: providerOf(model),
      vendor: model.vendor,
      kind: model.kind,
      lane: model.lane,
      format,
      raw_idea: rawIdea,
      prompt: promptWithDirection,
      reference_count: normalizedAssets.length,
      reference_mode: normalizedAssets.length ? normalizedAssets.map((asset) => asset.field).join(",") : null,
      input_assets: normalizedAssets,
      params: input,
      request_id: q.request_id,
      cost,
      cost_confidence: confidence,
      cost_basis: basis,
      billable_units: billableUnits,
      estimated_cost: pre.cost,
      outputs,
    };
    appendLedger(row);

    send({ phase: "done", result, ledger: row, spend: spendSummary() });
    res.end();
  } catch (e) {
    console.warn(`generation failed: ${String(e.message ?? e)}`);
    send({ phase: "error", error: publicProviderError(e, "generation") });
    res.end();
  }
});

function extractUrls(result) {
  const urls = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v.url === "string") urls.push({
      url: v.url,
      content_type: v.content_type ?? null,
      width: v.width ?? null,
      height: v.height ?? null,
      // Provider local já entrega o arquivo gravado. Sem carregar isto adiante,
      // mirrorOutputs trataria a saída como remota e tentaria baixá-la.
      ...(v.local_path ? { local_path: v.local_path, local_url: v.local_url ?? null } : {}),
    });
    Object.values(v).forEach(walk);
  };
  walk(result);
  return urls;
}

const PORT = process.env.PORT || 8787;

// Start serving immediately. Price discovery is useful, but it should never
// make the whole studio look offline while fal is slow or rate-limiting us.
LIVE_PRICES = readPriceCache();
const cachedPriced = Object.keys(LIVE_PRICES).length;

app.listen(PORT, () => {
  const s = spendSummary();
  console.log(`studio server on http://localhost:${PORT}`);
  console.log(`  ${registry.models.length} models, ${Object.keys(PROFILES).length} prompt profiles`);
  console.log(`  API-derived image inputs: ${registry.models.filter((model) => imageInputForModel(model)).length}/${registry.models.length}`);
  console.log(`  cached prices: ${cachedPriced}/${falModels().length} fal models; refreshing in background`);
  const byProvider = registry.models.reduce((acc, m) => { const p = providerOf(m); acc[p] = (acc[p] ?? 0) + 1; return acc; }, {});
  console.log(`  providers: ${Object.entries(byProvider).map(([p, n]) => `${p}=${n}`).join(", ")}`);
  console.log(`  spend: $${s.all_time} all time, $${s.month} this month, ${s.total_generations} generations`);
});

fetchLivePrices(falModels().map((m) => m.id))
  .then((prices) => {
    LIVE_PRICES = prices;
    console.log(`pricing refresh complete: ${Object.keys(LIVE_PRICES).length}/${falModels().length} fal models`);
  })
  .catch((e) => console.warn(`pricing refresh failed: ${e.message}`));

// Discovery is deliberately independent of serving and generation. A fal
// outage cannot take the studio down, and an unvalidated endpoint can never
// silently replace a working production model.
refreshCatalogDiscovery().catch((error) => console.warn(`catalog sync failed: ${error.message}`));
backfillMediaMirrors().catch((error) => console.warn(`media backfill failed: ${error.message}`));
setInterval(() => {
  refreshCatalogDiscovery().catch((error) => console.warn(`catalog sync failed: ${error.message}`));
}, 6 * 60 * 60 * 1000).unref();
