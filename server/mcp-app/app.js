import { App } from "@modelcontextprotocol/ext-apps";
import "./style.css";

// Este painel e uma pagina estatica embutida no cliente MCP — nao compartilha
// nada com o React do estudio, entao nao carrega o mecanismo de i18n dele. Sao
// sete frases: um dicionario local resolve, e o idioma vem do proprio cliente
// (Claude Desktop, Cursor), com portugues como padrao.
const STRINGS = {
  "pt-BR": {
    appName: "Resultados do Bench Studio",
    costPending: "Custo pendente",
    empty: "Nada gerado ainda.",
    asset: "Arquivo gerado",
    madeHere: "Gerado no Bench Studio",
    openVideo: "Abrir vídeo",
    openOriginal: "Abrir original",
    hostedCopy: "Cópia hospedada",
    eyebrow: "Bench Studio",
    heading: "Trabalho recente",
    loading: "Carregando…",
    count: (n) => `${n} resultado(s)`,
  },
  en: {
    appName: "Bench Studio results",
    costPending: "Cost pending",
    empty: "No generated assets yet.",
    asset: "Generated asset",
    madeHere: "Generated in Bench Studio",
    openVideo: "Open video",
    openOriginal: "Open original",
    hostedCopy: "Hosted copy",
    eyebrow: "Bench Studio",
    heading: "Latest work",
    loading: "Loading…",
    count: (n) => `${n} result(s)`,
  },
};

const LANG = String(navigator.language || "").toLowerCase().startsWith("en") ? "en" : "pt-BR";
const T = STRINGS[LANG];
document.documentElement.lang = LANG;
for (const node of document.querySelectorAll("[data-i18n]")) {
  const value = T[node.dataset.i18n];
  if (typeof value === "string") node.textContent = value;
}

const gallery = document.querySelector("#gallery");
const count = document.querySelector("#count");
const app = new App({ name: T.appName, version: "1.0.0" });

function money(value) {
  if (value == null) return T.costPending;
  return new Intl.NumberFormat(LANG, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value);
}

function linkButton(label, url, primary = false) {
  const button = document.createElement("button");
  button.className = primary ? "action primary" : "action";
  button.textContent = label;
  button.addEventListener("click", () => app.openLink({ url }));
  return button;
}

function render(payload) {
  const rows = payload?.rows ?? (payload?.outputs ? [payload] : []);
  gallery.replaceChildren();
  count.textContent = T.count(rows.length);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = T.empty;
    gallery.append(empty);
    return;
  }

  for (const row of rows) {
    for (const output of row.outputs ?? []) {
      const card = document.createElement("article");
      card.className = "card";
      const frame = document.createElement("div");
      frame.className = "frame";
      const type = output.content_type || "";

      if (type.startsWith("video/")) {
        const video = document.createElement("video");
        video.src = output.local_url || output.remote_url || output.url;
        video.poster = output.preview_url || "";
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        frame.append(video);
      } else if (type.startsWith("image/")) {
        const image = document.createElement("img");
        image.src = output.preview_url || output.local_url || output.remote_url || output.url;
        image.alt = row.prompt || row.label || T.asset;
        frame.append(image);
      }

      const details = document.createElement("div");
      details.className = "details";
      const copy = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = row.label || row.model || T.asset;
      const prompt = document.createElement("p");
      prompt.className = "prompt";
      prompt.textContent = row.raw_idea || row.prompt || T.madeHere;
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = [row.kind, output.width && output.height ? `${output.width} × ${output.height}` : null, money(row.cost)].filter(Boolean).join(" · ");
      copy.append(title, prompt, meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      const assetUrl = output.local_url || output.remote_url || output.url;
      if (assetUrl) actions.append(linkButton(type.startsWith("video/") ? T.openVideo : T.openOriginal, assetUrl, true));
      if (output.remote_url && output.remote_url !== assetUrl) actions.append(linkButton(T.hostedCopy, output.remote_url));
      details.append(copy, actions);
      card.append(frame, details);
      gallery.append(card);
    }
  }
}

app.ontoolresult = (result) => render(result.structuredContent);
app.connect();
