import React, { useMemo, useState } from "react";
import { sortModels } from "./modelCatalog.js";

// The roster, as pictures. Every tile is a real sample frame published by the
// model itself, and the price is on the tile because that is the whole point.

const GROUPS = [
  { lane: "t2i", head: "Image models", note: "Start with a description" },
  { lane: "i2i", head: "Image edits", note: "Change a reference" },
  { lane: "t2v", head: "Video models", note: "Start with a description" },
  { lane: "i2v", head: "Image to video", note: "Animate an image" },
  { lane: "r2v", head: "Reference video", note: "Keep a look consistent" },
];

export default function ModelWall({ catalog, modelId, onPick, onToggle, onBulk, onRefresh, settings, onSettings }) {
  const [showUnavailable, setShowUnavailable] = useState(false);

  const [provider, setProvider] = useState("all");
  const [output, setOutput] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  // As opcoes saem do proprio catalogo, com contagem — provedor que voce nao tem
  // nao ocupa espaco na barra.
  const providerOptions = useMemo(() => {
    const counts = new Map();
    for (const m of catalog?.models ?? []) counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [catalog]);

  const stats = useMemo(() => {
    const models = catalog?.models ?? [];
    return {
      total: models.length,
      unavailable: models.filter((m) => m.available === false).length,
      off: models.filter((m) => m.available !== false && m.enabled === false).length,
    };
  }, [catalog]);

  if (!catalog) return null;

  // "Gratuito" aqui e fato apurado, nao rotulo: provedor local ou provedor cujo
  // preco medido e zero. Serve para o atalho de ligar so o que nao cobra.
  // O recorte vale para TODOS os grupos, e e o mesmo conjunto que os atalhos de
  // curadoria enxergam — senao "so os gratuitos" ignoraria o filtro na tela e a
  // pessoa veria um resultado diferente do que pediu.
  const matches = (m) =>
    (provider === "all" || m.provider === provider)
    && (output === "all" || m.kind === output)
    && (status === "all"
      || (status === "on" && m.enabled !== false && m.available !== false)
      || (status === "off" && m.enabled === false)
      || (status === "unavailable" && m.available === false))
    && (!query.trim() || `${m.label} ${m.vendor} ${m.id}`.toLowerCase().includes(query.trim().toLowerCase()));

  const visiveis = (catalog.models ?? []).filter(matches);
  const filtrando = provider !== "all" || output !== "all" || status !== "all" || query.trim();

  const freeIds = (catalog.models ?? [])
    .filter((m) => ["agnes", "inemaimg"].includes(m.provider))
    .map((m) => m.id);
  const localIds = (catalog.models ?? []).filter((m) => m.provider === "inemaimg").map((m) => m.id);

  // Cada grupo é um INTERRUPTOR, não um "só isto": clicar em Free liga os
  // gratuitos sem desligar o resto, e clicar de novo desliga só eles. O "só
  // isto" de antes escondia uma segunda ação (desligar tudo mais) atrás de um
  // rótulo que não a anunciava.
  const enabledIds = new Set((catalog.models ?? []).filter((m) => m.enabled !== false).map((m) => m.id));
  const allOn = (ids) => ids.length > 0 && ids.every((id) => enabledIds.has(id));

  return (
    <div className="wall model-wall">
      <div className="catalog-filters" role="group" aria-label="Filter catalog">
        <label className="results-filter">
          <span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">All ({stats.total})</option>
            {providerOptions.map(([id, count]) => <option key={id} value={id}>{id} ({count})</option>)}
          </select>
        </label>
        <label className="results-filter">
          <span>Output</span>
          <select value={output} onChange={(e) => setOutput(e.target.value)}>
            <option value="all">All</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>
        <label className="results-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="on">Enabled</option>
            <option value="off">Disabled ({stats.off})</option>
            <option value="unavailable">Unavailable ({stats.unavailable})</option>
          </select>
        </label>
        <label className="results-filter wide">
          <span>Search</span>
          <input value={query} placeholder="name, vendor or id" onChange={(e) => setQuery(e.target.value)} />
        </label>
        {filtrando && (
          <button type="button" className="results-filter-clear" onClick={() => { setProvider("all"); setOutput("all"); setStatus("all"); setQuery(""); }}>
            Clear
          </button>
        )}
      </div>

      <div className="catalog-toolbar">
        <div>
          <strong>{filtrando ? `${visiveis.length} of ${stats.total}` : stats.total} models</strong>
          {stats.unavailable > 0 && <span>{stats.unavailable} unavailable</span>}
          {stats.off > 0 && <span>{stats.off} turned off by you</span>}
        </div>
        <div className="catalog-toolbar-actions">
          {stats.unavailable > 0 && (
            <label className="catalog-switch-inline">
              <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
              Show unavailable
            </label>
          )}
          {onRefresh && (
            <button type="button" onClick={() => onRefresh()} title="Discovers new models, pulls live prices, and rechecks keys">
              Refresh catalog
            </button>
          )}
          {onSettings && (
            <label className="catalog-switch-inline" title="How often the catalog refreshes on its own">
              auto
              <select
                value={String(settings?.catalog_refresh_hours ?? 6)}
                onChange={(e) => onSettings({ catalog_refresh_hours: Number(e.target.value) })}
              >
                <option value="0">manual only</option>
                <option value="1">1h</option>
                <option value="6">6h</option>
                <option value="24">24h</option>
                <option value="168">weekly</option>
              </select>
            </label>
          )}
          {onBulk && (
            <>
              {filtrando && onToggle && (
                <>
                  <button type="button" onClick={() => onToggle(visiveis.map((m) => m.id), true)}>Enable the {visiveis.length} filtered</button>
                  <button type="button" onClick={() => onToggle(visiveis.map((m) => m.id), false)}>Disable those {visiveis.length}</button>
                </>
              )}
              <button
                type="button"
                className={allOn(freeIds) ? "on" : ""}
                onClick={() => onToggle(freeIds, !allOn(freeIds))}
                title={`${freeIds.length} models that cost nothing (Agnes and local)`}
              >
                Free
              </button>
              <button
                type="button"
                className={allOn(localIds) ? "on" : ""}
                onClick={() => onToggle(localIds, !allOn(localIds))}
                title={`${localIds.length} models running on your own machine`}
              >
                Local
              </button>
              <button type="button" onClick={() => onBulk({ only: [] })}>Clear all</button>
              <button type="button" onClick={() => onBulk({ reset: true })}>Enable all</button>
            </>
          )}
        </div>
      </div>
      {GROUPS.map((g) => {
        const models = sortModels(visiveis.filter((m) => m.lane === g.lane))
          // Modelo desligado continua visivel: e assim que da para liga-lo de
          // volta. O que ele perde e o destaque, nao a existencia. Indisponivel
          // so aparece se voce pedir, e nunca some sem dizer por que.
          .filter((m) => m.available !== false || showUnavailable);
        if (!models.length) return null;
        return (
          <section key={g.lane}>
            <div className="wall-head">
              <h2>{g.head}</h2>
              <span>{g.note}</span>
              <div className="rule" />
              <span>{models.length} {models.length === 1 ? "model" : "models"}</span>
            </div>
            <div className="grid">
              {models.map((m) => (
                <div className="card-wrap" key={m.id}>
                {onToggle && (
                  // Controle proprio, fora do botao do card: clicar aqui liga ou
                  // desliga e NUNCA navega. Antes isso vivia dentro do card e so
                  // aparecia num "modo curadoria" — quem clicava num card
                  // querendo liga-lo era levado para a tela de criacao.
                  <button
                    type="button"
                    className={`card-switch${m.enabled === false ? "" : " on"}`}
                    role="switch"
                    aria-checked={m.enabled !== false}
                    aria-label={`${m.enabled === false ? "Enable" : "Disable"} ${m.label}`}
                    title={m.enabled === false ? "Turn on: show in Create and MCP" : "Turn off: hide from Create and MCP"}
                    onClick={(event) => { event.stopPropagation(); onToggle(m.id, m.enabled === false); }}
                  >
                    {m.enabled === false ? "off" : "on"}
                  </button>
                )}
                <button
                  className={`card${m.id === modelId ? " on" : ""}${m.available === false ? " unavailable" : ""}${m.enabled === false ? " off" : ""}`}
                  onClick={() => onPick(m.id)}
                  disabled={m.available === false}
                  title={m.available === false ? `${m.unavailable_reason}. ${m.unavailable_hint ?? ""}` : m.id}
                >
                  {m.thumbnail ? (
                    <img className="shot" src={m.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <div className="shot" />
                  )}
                  <div className="body">
                    <div className="t">
                      <span
                        className={`pip${m.has_profile ? "" : " hollow"}`}
                        title={m.has_profile ? "Prompt profile ready" : "Prompt profile not available"}
                      />
                      {m.label}
                    </div>
                    <div className="s">
                      <span>{m.vendor}</span>
                      <b>{price(m)}</b>
                    </div>
                    <div className="card-capabilities">
                      <span>{m.kind === "video" ? "Video output" : "Image output"}</span>
                      <span>{m.capabilities?.modalities?.length
                        ? `Takes ${m.capabilities.modalities.map((item) => item === "document" ? "PDF" : item).join(" + ")}`
                        : "Prompt only"}</span>
                    </div>
                    <span className="card-evidence">{m.capabilities?.inputs?.length ? "Schema checked" : "No media input in schema"}</span>
                    {m.tier === "fastest" && <span className="card-tier">Fast lane</span>}
                    {m.available === false && (
                      <span className="card-unavailable">
                        <b>{m.unavailable_reason}</b>
                        {m.unavailable_hint && <small>{m.unavailable_hint}</small>}
                      </span>
                    )}
                  </div>
                </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// fal bills in different units per model, so say which unit rather than
// pretending everything is priced per picture.
const UNIT_LABEL = {
  images: "/img",
  megapixels: "/MP",
  "processed megapixels": "/MP",
  seconds: "/sec",
  "compute seconds": "/compute sec",
  units: "/unit",
};

function price(m) {
  const p = m.pricing;
  if (!p) return "";
  const n = p.price < 0.01 ? p.price.toFixed(5).replace(/0+$/, "") : String(p.price);
  return `$${n}${UNIT_LABEL[p.unit] ?? ""}`;
}
