import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  assignInputFields,
  imageCapacity,
  extraImageSlotsFor,
  imageInputFor,
  keyframeSlotsFor,
  mediaInputsFor,
  slotRole,
  modelKindLabel,
  modelLaneLabel,
  modelPriority,
  sortModels,
} from "./modelCatalog.js";
import { useT } from "./i18n/index.jsx";

// One bar, one action. Everything that changes the output is a chip inside it,
// including the model, so you never leave the thing you are typing in.

// Os valores destes controles VAO PARA O PROMPT e por isso continuam em ingles
// (`square_hd`, `landscape_16_9`); o que se traduz e como eles aparecem na
// tela. Chave desconhecida cai no proprio valor, formatado — assim um enum
// novo do provedor aparece legivel em vez de sumir.
function prettyParam(name, value, t) {
  const raw = String(value);
  const named = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];
  if (name === "image_size" && named.includes(raw)) {
    const label = t(`prompt.sizes.${raw}`);
    if (label !== `prompt.sizes.${raw}`) return label;
  }
  if (name === "duration") {
    if (raw.toLowerCase() === "auto") return t("prompt.auto");
    if (/^\d+(\.\d+)?s$/i.test(raw)) return raw;
    return t("prompt.seconds", { n: raw });
  }
  if (name === "fps") return `${raw} fps`;
  if (name === "num_images") return t("prompt.images", { n: raw });
  if (["generate_audio", "enable_prompt_expansion", "auto_fix"].includes(name)) {
    return raw === "true" ? t("prompt.on") : raw === "false" ? t("prompt.off") : raw;
  }
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paramLabel(name, t) {
  const label = t(`prompt.params.${name}`);
  return label === `prompt.params.${name}` ? prettyParam("", name, t) : label;
}

// Os submodos dos modos de fabrica agora vem do SERVIDOR, junto do modo a que
// pertencem (`SUBMODOS`, no server.mjs), e chegam aqui pelo catalogo. Antes
// viviam nesta constante, o que tornava um modo de fabrica editavel pela metade:
// dava para trocar o brief pela aba Modes e nao os seletores.

// Um caminho so para os dois casos. O rotulo vem do dicionario quando o campo
// traz `key` (submodo de fabrica) e vem cru quando nao traz (submodo que a
// propria pessoa escreveu, na aba Modes ou editando um de fabrica).
export function shotFields(controls, t) {
  return (controls ?? []).map((field) => ({
    id: field.id,
    label: field.key ? t(field.key) : field.label,
    options: (field.options ?? []).map((o) => ({
      value: typeof o === "string" ? o : o.value,
      label: typeof o === "string" ? o : (o.key ? t(o.key) : (o.label ?? o.value)),
    })),
  })).filter((field) => field.options.length);
}

function ShotDirection({ format, values, onChange, customControls }) {
  const t = useT();
  const fields = shotFields(customControls, t);
  if (!fields.length) return null;

  return (
    <section className="shot-direction" aria-label={t("prompt.shot.aria")}>
      <div className="shot-direction-head">
        <div>
          <strong>{t("prompt.shot.title")}</strong>
          <span>{t("prompt.shot.subtitle")}</span>
        </div>
        <span className="shot-direction-mode">{format === "ugc" ? t("prompt.shot.ugcRecipe") : t("prompt.shot.creativeRecipe")}</span>
      </div>
      <div className="shot-direction-fields">
        {fields.map((field) => (
          <div className="shot-direction-field" key={field.id}>
            <span>{field.label}</span>
            <MenuSelect
              value={values[field.id] ?? field.options[0].value}
              options={field.options}
              ariaLabel={field.label}
              className="direction-menu"
              onChange={(value) => onChange({ ...values, [field.id]: value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function MenuSelect({ value, options, onChange, placeholder, ariaLabel, className = "" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(value)));
  const selected = options.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function toggle() {
    setActive(selectedIndex);
    setOpen((current) => !current);
  }

  function choose(option) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + options.length) % options.length;
      });
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(options[active]);
    }
  }

  return (
    <div ref={rootRef} className={`menu-select${open ? " open" : ""}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label ?? placeholder}</span>
        <i className="menu-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-popover" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={`menu-option${String(option.value) === String(value) ? " selected" : ""}${active === index ? " active" : ""}`}
              key={String(option.value)}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <b aria-hidden="true">✓</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Chave de dicionario por unidade de cobranca. Unidade que o provedor invente
// amanha cai no proprio nome cru, em vez de sumir da tela.
const PRICE_UNITS = {
  images: "image",
  megapixels: "megapixel",
  "processed megapixels": "processedMegapixel",
  seconds: "second",
  "compute seconds": "computeSecond",
  units: "unit",
};

function priceUnit(unit, t) {
  const key = PRICE_UNITS[unit];
  if (!key) return unit;
  const label = t(`prompt.priceUnits.${key}`);
  return label === `prompt.priceUnits.${key}` ? unit : label;
}

function modelPrice(model, t) {
  const pricing = model?.pricing;
  if (!pricing) return t("prompt.priceUnavailable");
  const amount = Number(pricing.price);
  const value = amount < 0.01
    ? amount.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")
    : amount.toFixed(amount < 0.1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "");
  return `$${value} / ${priceUnit(pricing.unit, t)}`;
}

// "aceita 2 imagens" e informacao que o servidor sempre teve e a interface
// nunca dizia: o teto so aparecia como erro depois de anexar a imagem a mais.
function referenceCapacityLabel(model, t) {
  const slots = keyframeSlotsFor(model);
  if (slots) {
    const extra = extraImageSlotsFor(model);
    if (!extra.length) return t("prompt.capacity.keyframes");
    const max = extra.reduce((total, slot) => slot.max == null || total == null ? null : total + slot.max, 0);
    return t("prompt.capacity.keyframesPlus", {
      extra: max == null ? t("prompt.capacity.images") : t("prompt.capacity.nImages", { count: max }),
    });
  }
  const max = imageCapacity(model);
  if (max === 0) return "";
  if (max == null) return t("prompt.capacity.images");
  return max === 1 ? t("prompt.capacity.oneImage") : t("prompt.capacity.nImages", { count: max });
}

function ModelPicker({ model, models, onChange, referenceActive, refs = [] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [popoverStyle, setPopoverStyle] = useState(null);
  const [pinnedFilter, setPinnedFilter] = useState(() => {
    try { return localStorage.getItem("bench.model-filter-pinned") || ""; } catch { return ""; }
  });
  const [kindFilter, setKindFilter] = useState(() => {
    try {
      return localStorage.getItem("bench.model-filter-pinned") || localStorage.getItem("bench.model-filter") || "all";
    } catch { return "all"; }
  });
  const [providerFilter, setProviderFilter] = useState("all");
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const searchRef = useRef(null);
  const selectedRef = useRef(null);
  const normalizedQuery = query.trim().toLowerCase();
  const kindCounts = models.reduce((counts, candidate) => {
    counts[candidate.kind] = (counts[candidate.kind] ?? 0) + 1;
    return counts;
  }, {});
  // Um provedor por vez (ou todos): a escolha entre rotas do MESMO modelo —
  // Kling por credito de plano, fal por dolar/segundo — e a comparacao que essa
  // lista precisa deixar fazer sem rolagem.
  const providerCounts = models.reduce((counts, candidate) => {
    const id = candidate.provider ?? "fal";
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
  const providerOptions = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);
  const filteredModels = sortModels(models.filter((candidate) => {
    // A busca ANTES anulava o filtro de saida (`normalizedQuery ||`): digitar
    // "kling" trazia video no meio de uma lista filtrada em imagem, e a pessoa
    // via um resultado que contradizia o botao aceso. Os tres se somam.
    const matchesKind = kindFilter === "all" || candidate.kind === kindFilter;
    const matchesProvider = providerFilter === "all" || (candidate.provider ?? "fal") === providerFilter;
    const matchesQuery = !normalizedQuery ||
      `${candidate.label} ${candidate.vendor} ${candidate.id} ${candidate.provider ?? ""} ${modelLaneLabel(candidate, t)}`.toLowerCase().includes(normalizedQuery);
    return matchesKind && matchesProvider && matchesQuery;
  }));
  const popularModelId = filteredModels.find((candidate) => modelPriority(candidate) < 6)?.id;
  // Quantos a BUSCA acharia se os filtros nao estivessem ligados.
  const hiddenByFilters = !normalizedQuery ? 0 : models.filter((candidate) =>
    `${candidate.label} ${candidate.vendor} ${candidate.id} ${candidate.provider ?? ""} ${modelLaneLabel(candidate, t)}`
      .toLowerCase().includes(normalizedQuery)).length - filteredModels.length;

  function measurePopover() {
    const trigger = rootRef.current?.getBoundingClientRect();
    if (!trigger) return null;
    const headerBottom = document.querySelector(".top")?.getBoundingClientRect().bottom ?? 0;
    const edge = 12;
    const gap = 8;
    const safeTop = headerBottom + 10;
    const width = Math.min(470, window.innerWidth - edge * 2);
    const availableAbove = Math.max(180, trigger.top - safeTop - gap);
    const availableBelow = Math.max(180, window.innerHeight - trigger.bottom - edge - gap);
    const useAbove = availableAbove >= availableBelow;
    return {
      left: Math.max(edge, Math.min(trigger.left, window.innerWidth - width - edge)),
      top: useAbove ? safeTop : trigger.bottom + gap,
      width,
      maxHeight: useAbove ? availableAbove : availableBelow,
    };
  }

  useEffect(() => {
    try { localStorage.setItem("bench.model-filter", kindFilter); } catch {}
  }, [kindFilter]);

  function chooseFilter(next) {
    setKindFilter(next);
    setQuery("");
    if (next === "all" || model.kind === next) return;

    const compatible = sortModels(models.filter((candidate) =>
      candidate.kind === next && (!refs.length || assignInputFields(candidate, refs).ok)
    ));
    // Trocar imagem<->video e um gesto de FILTRAR, nao de escolher. Fechar o
    // painel aqui tirava a pessoa da lista justamente quando ela ia comparar as
    // opcoes do outro tipo; o painel fica aberto e a selecao so adianta um
    // padrao valido.
    if (compatible[0]) onChange(compatible[0].id);
  }

  function togglePinnedFilter() {
    const next = pinnedFilter === kindFilter ? "" : kindFilter;
    setPinnedFilter(next);
    try {
      if (next) localStorage.setItem("bench.model-filter-pinned", next);
      else localStorage.removeItem("bench.model-filter-pinned");
    } catch {}
  }

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const placePopover = () => setPopoverStyle(measurePopover());
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", placePopover);
    document.querySelector(".scroll")?.addEventListener("scroll", placePopover, { passive: true });
    placePopover();
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      // A lista abria no topo e o modelo em uso podia estar 40 linhas abaixo —
      // quem abria para "ver qual e" perdia justamente essa informacao. Rola
      // ate ele, centralizado, sem animacao (a lista ja aparece no lugar).
      selectedRef.current?.scrollIntoView({ block: "center" });
    });
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", placePopover);
      document.querySelector(".scroll")?.removeEventListener("scroll", placePopover);
    };
  }, [open]);

  function choose(candidate) {
    onChange(candidate.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`model-picker${open ? " open" : ""}`}>
      <button
        type="button"
        className="model-picker-trigger"
        aria-label={t("prompt.changeModel", { model: model.label, kind: modelKindLabel(model, t) })}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => {
          if (!current) {
            setKindFilter(model.kind);
            setQuery("");
            setPopoverStyle(measurePopover());
          }
          return !current;
        })}
      >
        {model.thumbnail && <img src={model.thumbnail} alt="" />}
        <span className="model-picker-name">{model.label}</span>
        <span className="model-option-provider trigger">{model.provider ?? "fal"}</span>
        {referenceCapacityLabel(model, t) && (
          <span className="model-picker-capacity">{referenceCapacityLabel(model, t)}</span>
        )}
        <span className={`model-picker-kind kind-${model.kind}${referenceActive ? " reference" : ""}`}>
          {referenceActive ? modelLaneLabel(model, t) : modelKindLabel(model, t)}
        </span>
        <i className="menu-chevron" aria-hidden="true" />
      </button>

      {open && createPortal((
        <div ref={popoverRef} className="model-picker-popover" style={popoverStyle ?? undefined}>
          <div className="model-picker-head">
            <div className="model-picker-head-copy">
              <strong>{t("prompt.chooseModel")}</strong>
              <span>{t("prompt.startWithOutput")}</span>
            </div>
            <div className="model-picker-head-actions">
              <span className="model-picker-count">{t("prompt.nAvailable", { count: models.length })}</span>
              {kindFilter !== "all" && (
                <button
                  type="button"
                  className={`model-filter-pin${pinnedFilter === kindFilter ? " active" : ""}`}
                  aria-pressed={pinnedFilter === kindFilter}
                  onClick={togglePinnedFilter}
                  title={pinnedFilter === kindFilter ? t("prompt.removeDefault") : t("prompt.openByDefault", { kind: modelKindLabel({ kind: kindFilter }, t) })}
                >
                  <i aria-hidden="true" />
                  {pinnedFilter === kindFilter ? t("prompt.default") : t("prompt.makeDefault")}
                </button>
              )}
            </div>
          </div>
          <div className="model-kind-filter" role="group" aria-label={t("prompt.filterByOutput")}>
            <span className="model-kind-filter-label">{t("catalog.output")}</span>
            <div className="model-kind-filter-options">
              {[
                { id: "all", label: t("work.all"), count: models.length },
                { id: "image", label: t("catalog.image"), count: kindCounts.image ?? 0 },
                { id: "video", label: t("catalog.video"), count: kindCounts.video ?? 0 },
              ].filter((filter) => filter.id === "all" || filter.count > 0).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`model-kind-filter-button${kindFilter === filter.id ? " active" : ""}`}
                  aria-pressed={kindFilter === filter.id}
                  aria-label={filter.id === "all" ? t("prompt.showAllModels") : t("prompt.switchOutput", { kind: filter.label })}
                  onClick={() => chooseFilter(filter.id)}
                >
                  <span className={`model-kind-filter-mark ${filter.id}`} aria-hidden="true" />
                  <span className="model-kind-filter-name">{filter.label}</span>
                  <b>{filter.count}</b>
                </button>
              ))}
            </div>
          </div>
          <label className="model-provider-filter">
            <span>{t("catalog.provider")}</span>
            <select
              value={providerFilter}
              aria-label={t("prompt.filterByProvider")}
              onChange={(event) => setProviderFilter(event.target.value)}
            >
              <option value="all">{t("work.all")} ({models.length})</option>
              {providerOptions.map(([id, count]) => (
                <option key={id} value={id}>{id} ({count})</option>
              ))}
            </select>
          </label>
          <input
            ref={searchRef}
            className="model-search"
            type="search"
            value={query}
            placeholder={t("prompt.searchModels")}
            aria-label={t("prompt.searchModels")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="model-list" role="listbox" aria-label={t("prompt.availableModels")}>
            {filteredModels.map((candidate) => (
              <button
                type="button"
                role="option"
                aria-selected={candidate.id === model.id}
                className={`model-option${candidate.id === model.id ? " selected" : ""}`}
                key={candidate.id}
                ref={candidate.id === model.id ? selectedRef : undefined}
                onClick={() => choose(candidate)}
              >
                {candidate.thumbnail ? (
                  <img src={candidate.thumbnail} alt="" />
                ) : (
                  <span className="model-option-placeholder" aria-hidden="true" />
                )}
                <span className="model-option-copy">
                  <b>
                    {candidate.label}
                    {/* A ROTA precisa aparecer aqui: o mesmo modelo existe em
                        mais de um provedor com cobranca diferente (Kling por
                        credito do plano, fal por dolar/segundo), e sem isto a
                        escolha entre eles vira adivinhacao. */}
                    <span className="model-option-provider">{candidate.provider ?? "fal"}</span>
                  </b>
                  <small>
                    {candidate.vendor} · {modelLaneLabel(candidate, t)} · {modelPrice(candidate, t)}
                    {candidate.capabilities?.modalities?.length ? t("prompt.takesInline", { list: candidate.capabilities.modalities.join(" + ") }) : ""}
                    {referenceCapacityLabel(candidate, t) ? ` · ${referenceCapacityLabel(candidate, t)}` : ""}
                  </small>
                </span>
                <span className="model-option-tail">
                  <span className={`model-option-kind kind-${candidate.kind}`}>{modelKindLabel(candidate, t)}</span>
                  {candidate.id === popularModelId && <em className="model-option-recommended">{t("prompt.popular")}</em>}
                  {candidate.tier === "fastest" && <em>{t("creative.fast")}</em>}
                  {candidate.id === model.id && <strong aria-label={t("prompt.selected")}>✓</strong>}
                </span>
              </button>
            ))}
            {!filteredModels.length && (
              <div className="model-empty">
                {t("prompt.noMatch", { query, kind: kindFilter === "all" ? t("prompt.anyKind") : t(`catalog.${kindFilter}`) })}
                {/* Somar busca e filtros e o certo, mas some o caminho de volta:
                    quem procurou um modelo que existe do outro lado do filtro
                    precisa ver que ele existe, e chegar la num clique. */}
                {hiddenByFilters > 0 && (
                  <button
                    type="button"
                    className="model-empty-clear"
                    onClick={() => { setKindFilter("all"); setProviderFilter("all"); }}
                  >
                    {t("prompt.hiddenByFilters", { count: hiddenByFilters })}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

export default function PromptBar({
  catalog, model, idea, setIdea, format, setFormat,
  params, setParams, hide, refs, onAttach, onRemoveRef,
  rewritten, setRewritten, onOptimize, onGenerate,
  quote, busy, running, onPickModel, referenceModel, shotSettings, setShotSettings,
}) {
  const t = useT();
  const fileRef = useRef(null);
  const [openRewrite, setOpenRewrite] = useState(true);
  const [showDropzone, setShowDropzone] = useState(false);
  const [dragging, setDragging] = useState(false);

  if (!catalog || !model) {
    return (
      <div className="bar-wrap">
        <div className="bar-loading" aria-busy="true">
          <span className="loading-orb" aria-hidden="true" />
          <div>
            <strong>{t("prompt.connecting")}</strong>
            <span>{t("prompt.connectingBody")}</span>
          </div>
          <small>{t("prompt.justAMoment")}</small>
        </div>
      </div>
    );
  }

  // Endpoints list their params in arbitrary order, so rank by what a person
  // actually reaches for. Without this, an interesting control like LTX's
  // camera_motion gets pushed off the bar by plumbing.
  const CHIP_ORDER = [
    "aspect_ratio", "duration", "resolution", "image_size", "camera_motion",
    "shot_type", "quality", "thinking_level", "fps", "num_images",
    "generate_audio", "enable_prompt_expansion", "auto_fix",
  ];
  const rank = (n) => {
    const i = CHIP_ORDER.indexOf(n);
    return i === -1 ? 99 : i;
  };

  const chipParams = Object.entries(model.params)
    .filter(([n, s]) => !hide.has(n) && s.enum?.length)
    .sort(([a], [b]) => rank(a) - rank(b))
    .slice(0, 5);

  const ready = Boolean((rewritten?.prompt ?? idea).trim());
  const rewriteWords = String(rewritten?.prompt ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const canAttach = Boolean(imageInputFor(model) || referenceModel);
  // Dois campos de imagem de uma vaga cada = primeiro e ultimo quadro. Viram
  // dois seletores nomeados; sem isso a ordem de anexo decidia sozinha qual
  // imagem era o inicio e qual era o fim.
  const keyframeSlots = keyframeSlotsFor(model);
  const extraImageSlots = keyframeSlots ? extraImageSlotsFor(model) : [];
  const keyframeFields = new Set((keyframeSlots ?? []).map((slot) => slot.field));
  // Referencias que NAO ocupam um quadro nomeado continuam na tira comum.
  const looseRefs = keyframeSlots ? refs.filter((r) => !keyframeFields.has(r.field)) : refs;
  const imageMax = imageCapacity(model);
  const refCapacityHint = keyframeSlots
    ? t("prompt.capacity.keyframes")
    : imageMax === 0 ? ""
    : imageMax == null ? t("prompt.capacity.images")
    : imageMax === 1 ? t("prompt.capacity.oneImage")
    : t("prompt.capacity.nImages", { count: imageMax });
  const directInputs = mediaInputsFor(model);
  const acceptedModalities = [...new Set(directInputs.map((input) => input.modality).filter((item) => item !== "mixed"))];
  if (!acceptedModalities.includes("image") && referenceModel) acceptedModalities.push("image");
  const canAttachMedia = acceptedModalities.length > 0;
  const accept = acceptedModalities.map((type) => ({
    image: "image/png,image/jpeg,image/webp,image/gif",
    video: "video/mp4,video/quicktime",
    audio: "audio/mpeg,audio/wav,audio/x-wav",
    document: "application/pdf",
  }[type])).filter(Boolean).join(",");
  const acceptedLabel = acceptedModalities.map((type) => type === "document" ? "PDF" : t(`prompt.media.${type}`)).join(", ");
  const attachmentHint = directInputs.length === 0 && referenceModel
    ? t("prompt.switchesTo", { model: referenceModel.label })
    : acceptedLabel
    ? t("prompt.modelAccepts", { list: acceptedLabel })
    : t("prompt.pickCompatible");
  const quickFormats = [
    { id: "ugc", label: t("work.formats.ugc") },
    { id: "none", label: t("prompt.freeform") },
    { id: "unboxing", label: t("work.formats.unboxing") },
    { id: "product", label: t("work.formats.product") },
  ];
  const quickFormatIds = new Set(quickFormats.map(({ id }) => id));
  const otherFormats = (catalog.formats ?? []).filter(({ id }) => !quickFormatIds.has(id));
  const otherFormatOptions = otherFormats.map(({ id, label }) => ({ value: id, label }));

  async function addFiles(fileList, field = null) {
    const files = Array.from(fileList ?? []);
    // Um seletor de quadro tem uma vaga: dele so entra o primeiro arquivo.
    for (const file of (field ? files.slice(0, 1) : files)) await onAttach(file, field);
  }

  return (
    <div className="bar-wrap">
      <div className="bar">
        <div className="preset-row" aria-label={t("prompt.creationMode")}>
          <span className="preset-label">{t("prompt.modeLabel")}</span>
          {quickFormats.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset${format === preset.id ? " on" : ""}`}
              onClick={() => setFormat(preset.id)}
            >
              {preset.label}
            </button>
          ))}
          {format === "ugc" && <span className="preset-detail">{t("prompt.ugcDetail")}</span>}
          {otherFormats.length > 0 && (
            <div className={`preset-more${quickFormatIds.has(format) ? "" : " on"}`}>
              <MenuSelect
                value={quickFormatIds.has(format) ? "" : format}
                options={otherFormatOptions}
                placeholder={t("prompt.moreModes")}
                ariaLabel={t("prompt.moreModesAria")}
                onChange={setFormat}
              />
            </div>
          )}
        </div>

        <ShotDirection
          format={format}
          values={shotSettings}
          onChange={setShotSettings}
          customControls={(catalog.formats ?? []).find((f) => f.id === format)?.controls}
        />

        <div className="bar-top">
          {keyframeSlots && (
            // Um seletor por quadro, nomeado. Cada um busca a sua imagem.
            <div className="keyframe-slots" role="group" aria-label={t("prompt.capacity.keyframes")}>
              {keyframeSlots.map((slot) => {
                const filled = refs.find((r) => r.field === slot.field);
                const role = slotRole(slot.field);
                const label = role === "last" ? t("prompt.slot.last")
                  : role === "first" ? t("prompt.slot.first")
                  : slot.field;
                // O numero diz a ORDEM no video (1 abre, 2 fecha) — sem ele
                // "inicial" e "final" viram dois campos parecidos lado a lado.
                const order = role === "last" ? 2 : 1;
                const hint = role === "last" ? t("prompt.slot.lastHint") : t("prompt.slot.firstHint");
                return (
                  <label className={`keyframe-slot${filled ? " filled" : ""}`} key={slot.field} title={hint}>
                    <span className="keyframe-slot-label">
                      <b>{order}</b> {label}
                    </span>
                    {filled ? (
                      <span className="keyframe-slot-thumb">
                        <img src={filled.preview} alt={filled.name} />
                        <button
                          type="button"
                          className="attach-remove"
                          onClick={(event) => { event.preventDefault(); onRemoveRef(refs.indexOf(filled)); }}
                          aria-label={t("prompt.removeNamed", { name: filled.name })}
                        >×</button>
                      </span>
                    ) : (
                      <span className="keyframe-slot-empty" aria-hidden="true">+</span>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(event) => { addFiles(event.target.files, slot.field); event.target.value = ""; }}
                    />
                  </label>
                );
              })}
            </div>
          )}
          {(!keyframeSlots || extraImageSlots.length > 0) && looseRefs.length > 0 && (
            <div className="attach-thumbs">
              {looseRefs.map((r) => (
                <span className="attach-thumb-wrap" key={r.url}>
                  {r.media_type === "image" ? (
                    <img className="attach-thumb" src={r.preview} alt={r.name} />
                  ) : (
                    <span className={`attach-file attach-file-${r.media_type}`} title={r.name}>
                      <b>{r.media_type === "document" ? "PDF" : r.media_type}</b>
                      <small>{r.name}</small>
                    </span>
                  )}
                  <button
                    type="button"
                    className="attach-remove"
                    onClick={() => onRemoveRef(refs.indexOf(r))}
                    aria-label={t("prompt.removeNamed", { name: r.name })}
                    title={t("prompt.removeReference")}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {(!keyframeSlots || extraImageSlots.length > 0) && !showDropzone && (
            <button
              type="button"
              className="attach"
              onClick={() => setShowDropzone(true)}
              disabled={busy || !canAttachMedia}
              aria-expanded={false}
              aria-label={t("prompt.addMedia")}
              title={
                imageInputFor(model)
                  ? t("prompt.attachUsing", { lane: modelLaneLabel(model, t) })
                  : referenceModel
                  ? t("prompt.attachSwitches", { lane: modelLaneLabel(referenceModel, t) })
                  : t("prompt.noReferenceInput")
              }
            >
              +
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <textarea
            id="prompt-idea"
            name="prompt"
            value={idea}
            placeholder={t("prompt.ideaPlaceholder")}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                rewritten ? onGenerate() : onOptimize();
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onGenerate();
              }
            }}
          />

          <button type="button" className="go" onClick={rewritten ? onGenerate : onOptimize} disabled={busy || !ready}>
            {running ? t("prompt.running") : busy ? t("prompt.working") : rewritten ? t("prompt.generate") : t("prompt.refine")}
          </button>
        </div>

        {showDropzone && (
          <div className="dropzone-wrap">
            <div
              className={`dropzone${dragging ? " dragging" : ""}`}
              role="button"
              tabIndex={canAttachMedia ? 0 : -1}
              aria-label={t("prompt.addMedia")}
              aria-disabled={!canAttachMedia}
              onClick={() => {
                if (canAttachMedia && !busy) fileRef.current?.click();
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && canAttachMedia && !busy) {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <div className="dropzone-visual" aria-hidden="true">
                <span className="dropzone-card dropzone-card-back" />
                <span className="dropzone-card dropzone-card-front"><i /></span>
                <span className="dropzone-sweep" />
              </div>
              <div className="dropzone-copy">
                <strong>{dragging ? t("prompt.releaseToAttach") : t("prompt.dropHere")}</strong>
                <span>{attachmentHint}{refCapacityHint ? ` · ${refCapacityHint}` : ""} · {t("prompt.orBrowse")}</span>
              </div>
              {refs.length > 0 && (
                <span className="dropzone-count">
                  {t("prompt.filesAttached", { count: refs.length, lane: modelLaneLabel(model, t) })}
                </span>
              )}
            </div>
            <button
              type="button"
              className="dropzone-close"
              aria-label={t("prompt.closeMediaArea")}
              onClick={(e) => {
                e.stopPropagation();
                setShowDropzone(false);
                setDragging(false);
              }}
            >
              {t("common.close")}
            </button>
          </div>
        )}

        <div className="bar-chips">
          <ModelPicker
            model={model}
            // Curadoria vale aqui tambem, senao "desliguei 60 modelos" nao
            // muda nada onde o modelo e de fato escolhido. Indisponivel sai
            // igual: oferecer um modelo sem chave e oferecer um erro.
            models={catalog.models.filter((m) => m.enabled !== false && m.available !== false)}
            onChange={onPickModel}
            referenceActive={refs.length > 0}
            refs={refs}
          />

          {chipParams.map(([name, spec]) => (
            <span className="chip" key={name} title={spec.description ?? spec.title}>
              {/* O valor sozinho ("True") nao diz o que e verdade. O nome vem do
                  schema do provedor (`title`), e a descricao dele fica no "?" —
                  a informacao ja chegava aqui e morria num tooltip do span. */}
              <span className="chip-param-label">{spec.title ?? paramLabel(name, t)}</span>
              <MenuSelect
                value={params[name] ?? spec.default ?? spec.enum[0]}
                options={spec.enum.map((o) => ({ value: String(o), label: prettyParam(name, o, t) }))}
                ariaLabel={paramLabel(name, t)}
                onChange={(value) => setParams((p) => ({ ...p, [name]: value }))}
              />
              {spec.description && (
                <abbr className="chip-help" title={spec.description}>?</abbr>
              )}
            </span>
          ))}

          {quote?.cost != null ? (
            <span className="bar-price exact" title={quote.basis}>
              <span>{t("prompt.estimatedTotal")}</span>
              <b>${quote.cost.toFixed(3)}</b>
            </span>
          ) : quote?.confidence === "unquotable" ? (
            <span className="bar-price metered" title={quote.basis}>
              <span className="bar-price-label">{t("prompt.usageBased")}</span>
              <span className="bar-price-rate">
                <strong>${quote.unit_price}</strong>
                <span>{t("prompt.perUnit", { unit: priceUnit(quote.unit, t) })}</span>
              </span>
              <small>{t("prompt.exactAfter")}</small>
            </span>
          ) : null}
        </div>
      </div>

      {rewritten && (
        <section className="rewrite" aria-label={t("prompt.draftAria")}>
          <div className="rewrite-head">
            <div className="rewrite-title">
              <strong>{t("prompt.draft")}</strong>
              <span>
                {rewritten.optimized
                  ? t("prompt.tunedFor", { model: model.label })
                  : t("prompt.asWritten", { reason: rewritten.reason })}
              </span>
            </div>
            <div className="rewrite-actions">
              <button type="button" className="rewrite-action" onClick={() => setRewritten(null)}>{t("prompt.discard")}</button>
              <button
                type="button"
                className="rewrite-action"
                aria-expanded={openRewrite}
                onClick={() => setOpenRewrite((v) => !v)}
              >
                {openRewrite ? t("prompt.hide") : t("prompt.editDraft")}
              </button>
            </div>
          </div>
          {openRewrite && (
            <div className="rewrite-body">
              <label htmlFor="rewritten-prompt">{t("prompt.editWording")}</label>
              <textarea
                id="rewritten-prompt"
                name="rewritten-prompt"
                aria-label={t("prompt.rewrittenAria")}
                value={rewritten.prompt}
                onChange={(e) => setRewritten({ ...rewritten, prompt: e.target.value })}
              />
              <div className="rewrite-foot">
                <span>{t("prompt.words", { count: rewriteWords })}</span>
                <span>{t("prompt.editsUsed")}</span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
