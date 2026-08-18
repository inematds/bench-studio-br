import React, { useMemo, useState } from "react";
import { sortModels } from "./modelCatalog.js";
import { useT } from "./i18n/index.jsx";

// O elenco, em fichas. Sem miniatura de amostra: a imagem do proprio modelo nao
// ajuda a escolher entre 73 deles e enchia a tela de ruido — o que decide e
// nome, provedor, preco e o que o modelo aceita de entrada.

const GROUPS = ["t2i", "i2i", "t2v", "i2v", "r2v"];

export default function ModelWall({ catalog, modelId, onPick, onToggle, onBulk }) {
  const t = useT();
  const [showUnavailable, setShowUnavailable] = useState(false);

  const [provider, setProvider] = useState("all");
  const [output, setOutput] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  // As opcoes saem do proprio catalogo, com contagem — provedor que voce nao tem
  // nao ocupa espaco na barra.
  // Por provedor: quantos existem, quantos estao ligados e se a rota esta
  // utilizavel. E a unidade natural de decisao — quase toda escolha aqui e
  // "quero ou nao quero este provedor", nao modelo a modelo.
  const providerOptions = useMemo(() => {
    const acc = new Map();
    for (const m of catalog?.models ?? []) {
      const cur = acc.get(m.provider) ?? { id: m.provider, label: m.provider_label ?? m.provider, total: 0, on: 0, ids: [], available: m.available !== false };
      cur.total += 1;
      cur.ids.push(m.id);
      if (m.enabled !== false) cur.on += 1;
      if (m.available === false) cur.available = false;
      acc.set(m.provider, cur);
    }
    return [...acc.values()].sort((a, b) => b.total - a.total);
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

  // Custo vem da classe que o servidor deriva do adapter (cost_class), nao de
  // uma lista de nomes de provedor aqui: quem cobra hoje pode nao cobrar amanha.
  const idsComClasse = (classe) => (catalog.models ?? []).filter((m) => m.cost_class === classe).map((m) => m.id);
  const freeIds = idsComClasse("free");
  const creditIds = idsComClasse("credits");
  const localIds = (catalog.models ?? []).filter((m) => m.provider === "inemaimg").map((m) => m.id);

  // Cada grupo é um INTERRUPTOR, não um "só isto": clicar em Free liga os
  // gratuitos sem desligar o resto, e clicar de novo desliga só eles. O "só
  // isto" de antes escondia uma segunda ação (desligar tudo mais) atrás de um
  // rótulo que não a anunciava.
  const enabledIds = new Set((catalog.models ?? []).filter((m) => m.enabled !== false).map((m) => m.id));
  const allOn = (ids) => ids.length > 0 && ids.every((id) => enabledIds.has(id));

  return (
    <div className="wall model-wall">
      <div className="catalog-filters" role="group" aria-label={t("catalog.filterCatalog")}>
        <div className="provider-chips" role="group" aria-label={t("catalog.providers")}>
          <span className="results-filter-label">{t("catalog.provider")}</span>
          <button
            type="button"
            className={`provider-chip${provider === "all" ? " selected" : ""}`}
            onClick={() => setProvider("all")}
          >
            {t("work.all")} <small>{stats.total}</small>
          </button>
          {providerOptions.map((p) => (
            <span className={`provider-chip-wrap${provider === p.id ? " selected" : ""}${p.available ? "" : " unavailable"}`} key={p.id}>
              <button
                type="button"
                className="provider-chip"
                onClick={() => setProvider(provider === p.id ? "all" : p.id)}
                title={p.available ? t("catalog.showOnly", { provider: p.label }) : t("catalog.providerUnavailable", { provider: p.label })}
              >
                {p.id} <small>{p.on}/{p.total}</small>
              </button>
              {onToggle && (
                // Liga ou desliga o provedor INTEIRO. Meio caminho (alguns
                // ligados) conta como desligado para o clique: o gesto esperado
                // e "quero este provedor", e ai o certo e ligar o que falta.
                <button
                  type="button"
                  className={`provider-switch${p.on === p.total ? " on" : ""}`}
                  role="switch"
                  aria-checked={p.on === p.total}
                  aria-label={p.on === p.total ? t("catalog.disableAllOf", { provider: p.label }) : t("catalog.enableAllOf", { provider: p.label })}
                  title={p.on === p.total ? t("catalog.turnOffAll", { count: p.total }) : t("catalog.turnOnAll", { count: p.total })}
                  onClick={() => onToggle(p.ids, p.on !== p.total)}
                >
                  {p.on === p.total ? t("catalog.on") : p.on === 0 ? t("catalog.off") : `${p.on}`}
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Linha de baixo: achar (saida, status, busca). Os chips de provedor
          ficam sozinhos na linha de cima — sao 5 e ja enchem a largura. */}
      <div className="catalog-filters catalog-filters-find" role="group" aria-label={t("catalog.filterCatalog")}>
        <label className="results-filter">
          <span>{t("catalog.output")}</span>
          <select value={output} onChange={(e) => setOutput(e.target.value)}>
            <option value="all">{t("work.all")}</option>
            <option value="image">{t("catalog.image")}</option>
            <option value="video">{t("catalog.video")}</option>
          </select>
        </label>
        <label className="results-filter">
          <span>{t("catalog.status")}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t("work.all")}</option>
            <option value="on">{t("catalog.enabled")}</option>
            <option value="off">{t("catalog.disabled")} ({stats.off})</option>
            <option value="unavailable">{t("catalog.unavailable")} ({stats.unavailable})</option>
          </select>
        </label>
        <label className="results-filter wide">
          <span>{t("catalog.search")}</span>
          <input value={query} placeholder={t("catalog.searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {filtrando && (
          <button type="button" className="results-filter-clear" onClick={() => { setProvider("all"); setOutput("all"); setStatus("all"); setQuery(""); }}>
            {t("work.clear")}
          </button>
        )}
      </div>

      <div className="catalog-toolbar">
        <div>
          <strong>{filtrando ? t("catalog.modelsOf", { shown: visiveis.length, total: stats.total }) : t("catalog.models", { count: stats.total })}</strong>
          {stats.unavailable > 0 && <span>{t("catalog.nUnavailable", { count: stats.unavailable })}</span>}
          {stats.off > 0 && <span>{t("catalog.nTurnedOff", { count: stats.off })}</span>}
        </div>
        <div className="catalog-toolbar-actions">
          {stats.unavailable > 0 && (
            <label className="catalog-switch-inline">
              <input type="checkbox" checked={showUnavailable} onChange={(e) => setShowUnavailable(e.target.checked)} />
              {t("catalog.showUnavailable")}
            </label>
          )}
          {onBulk && (
            <>
              {filtrando && onToggle && (
                <>
                  <button type="button" onClick={() => onToggle(visiveis.map((m) => m.id), true)}>{t("catalog.enableFiltered", { count: visiveis.length })}</button>
                  <button type="button" onClick={() => onToggle(visiveis.map((m) => m.id), false)}>{t("catalog.disableFiltered", { count: visiveis.length })}</button>
                </>
              )}
              <button
                type="button"
                className={allOn(freeIds) ? "on" : ""}
                onClick={() => onToggle(freeIds, !allOn(freeIds))}
                title={t("catalog.noCostTitle", { count: freeIds.length })}
              >
                {t("catalog.noCost")}
              </button>
              {creditIds.length > 0 && (
                <button
                  type="button"
                  className={allOn(creditIds) ? "on" : ""}
                  onClick={() => onToggle(creditIds, !allOn(creditIds))}
                  title={t("catalog.planCreditsTitle", { count: creditIds.length })}
                >
                  {t("catalog.planCredits")}
                </button>
              )}
              <button
                type="button"
                className={allOn(localIds) ? "on" : ""}
                onClick={() => onToggle(localIds, !allOn(localIds))}
                title={t("catalog.localTitle", { count: localIds.length })}
              >
                {t("catalog.local")}
              </button>
              <button type="button" onClick={() => onBulk({ only: [] })}>{t("catalog.clearAll")}</button>
              <button type="button" onClick={() => onBulk({ reset: true })}>{t("catalog.enableAll")}</button>
            </>
          )}
        </div>
      </div>
      {GROUPS.map((lane) => {
        const models = sortModels(visiveis.filter((m) => m.lane === lane))
          // Modelo desligado continua visivel: e assim que da para liga-lo de
          // volta. O que ele perde e o destaque, nao a existencia. Indisponivel
          // so aparece se voce pedir, e nunca some sem dizer por que.
          .filter((m) => m.available !== false || showUnavailable);
        if (!models.length) return null;
        return (
          <section key={lane} className={`lane-section lane-${lane}`}>
            <div className="wall-head">
              <h2>{t(`catalog.lanes.${lane}.head`)}</h2>
              <span>{t(`catalog.lanes.${lane}.note`)}</span>
              <div className="rule" />
              <span>{t("catalog.models", { count: models.length })}</span>
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
                    aria-label={m.enabled === false ? t("catalog.enableModel", { model: m.label }) : t("catalog.disableModel", { model: m.label })}
                    title={m.enabled === false ? t("catalog.turnOnHint") : t("catalog.turnOffHint")}
                    onClick={(event) => { event.stopPropagation(); onToggle(m.id, m.enabled === false); }}
                  >
                    {m.enabled === false ? t("catalog.off") : t("catalog.on")}
                  </button>
                )}
                <button
                  className={`card${m.id === modelId ? " on" : ""}${m.available === false ? " unavailable" : ""}${m.enabled === false ? " off" : ""}`}
                  onClick={() => onPick(m.id)}
                  disabled={m.available === false}
                  title={m.available === false ? `${m.unavailable_reason}. ${m.unavailable_hint ?? ""}` : m.id}
                >
                  <div className="body">
                    <div className="t">
                      <span
                        className={`pip${m.has_profile ? "" : " hollow"}`}
                        title={m.has_profile ? t("catalog.profileReady") : t("catalog.profileMissing")}
                      />
                      {m.label}
                    </div>
                    <div className="s">
                      <span>{m.vendor}</span>
                      <b>{price(m, t) || (m.cost_class ? t(`catalog.cost.${m.cost_class}`) : "")}</b>
                    </div>
                    <div className="card-capabilities">
                      <span>{m.kind === "video" ? t("catalog.videoOutput") : t("catalog.imageOutput")}</span>
                      <span>{m.capabilities?.modalities?.length
                        ? t("catalog.takes", { list: m.capabilities.modalities.map((item) => item === "document" ? "PDF" : item).join(" + ") })
                        : t("catalog.promptOnly")}</span>
                    </div>
                    <span className="card-evidence">{m.capabilities?.inputs?.length ? t("catalog.schemaChecked") : t("catalog.noMediaInput")}</span>
                    {m.tier === "fastest" && <span className="card-tier">{t("catalog.fastLane")}</span>}
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
// Nem todo provedor cobra em dolar. Sem isto, um modelo do Kling (credito de
// plano) e um da Agnes (zero hoje) apareciam com o preco em branco, como se a
// informacao nao existisse.
const UNIT_KEYS = {
  images: "images",
  megapixels: "megapixels",
  "processed megapixels": "megapixels",
  seconds: "seconds",
  "compute seconds": "computeSeconds",
  units: "units",
};

function price(m, t) {
  const p = m.pricing;
  if (!p) return "";
  const n = p.price < 0.01 ? p.price.toFixed(5).replace(/0+$/, "") : String(p.price);
  const key = UNIT_KEYS[p.unit];
  return `$${n}${key ? t(`catalog.units.${key}`) : ""}`;
}
