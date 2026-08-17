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

export default function ModelWall({ catalog, modelId, onPick, onToggle, onBulk }) {
  const [curating, setCurating] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);

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
  const freeIds = (catalog.models ?? [])
    .filter((m) => ["agnes", "inemaimg"].includes(m.provider))
    .map((m) => m.id);
  const localIds = (catalog.models ?? []).filter((m) => m.provider === "inemaimg").map((m) => m.id);

  return (
    <div className="wall model-wall">
      <div className="catalog-toolbar">
        <div>
          <strong>{stats.total} modelos</strong>
          {stats.unavailable > 0 && <span>{stats.unavailable} indisponíveis</span>}
          {stats.off > 0 && <span>{stats.off} desligados por você</span>}
        </div>
        <div className="catalog-toolbar-actions">
          {stats.unavailable > 0 && (
            <label className="catalog-switch-inline">
              <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
              Mostrar indisponíveis
            </label>
          )}
          {onToggle && (
            <button type="button" className={curating ? "on" : ""} onClick={() => setCurating((v) => !v)}>
              {curating ? "Concluir curadoria" : "Escolher modelos"}
            </button>
          )}
          {curating && onBulk && (
            <>
              <button type="button" onClick={() => onBulk({ only: freeIds })}>Só os gratuitos</button>
              <button type="button" onClick={() => onBulk({ only: localIds })}>Só os locais</button>
              <button type="button" onClick={() => onBulk({ reset: true })}>Ligar tudo</button>
            </>
          )}
        </div>
      </div>
      {GROUPS.map((g) => {
        const models = sortModels(catalog.models.filter((m) => m.lane === g.lane))
          // Fora da curadoria, some o que voce desligou; indisponivel so aparece
          // se voce pedir — mas NUNCA some sem dizer por que (ver a barra acima).
          .filter((m) => curating || (m.enabled !== false && (m.available !== false || showUnavailable)));
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
                <button
                  key={m.id}
                  className={`card${m.id === modelId ? " on" : ""}${m.available === false ? " unavailable" : ""}${m.enabled === false ? " off" : ""}`}
                  onClick={() => (curating && onToggle ? onToggle(m.id, m.enabled === false) : onPick(m.id))}
                  disabled={!curating && m.available === false}
                  title={m.available === false ? `${m.unavailable_reason}. ${m.unavailable_hint ?? ""}` : m.id}
                >
                  {curating && (
                    <span className={`card-switch${m.enabled === false ? "" : " on"}`} aria-hidden="true">
                      {m.enabled === false ? "desligado" : "ligado"}
                    </span>
                  )}
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
