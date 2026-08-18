export const MODEL_KIND_LABELS = {
  image: "Image",
  video: "Video",
};

export const MODEL_LANE_LABELS = {
  t2i: "Text to image",
  i2i: "Edit an image",
  t2v: "Text to video",
  i2v: "Image to video",
  r2v: "Reference to video",
};

// A small editorial order for the first screen of the picker. This is not a
// performance claim; it puts the most useful starting points for ad work first
// and leaves the full catalog one search away.
export const MODEL_PRIORITY = [
  "fal-ai/veo3.1/fast",
  "fal-ai/kling-video/v3/pro/text-to-video",
  "bytedance/seedance-2.5/text-to-video",
  "fal-ai/veo3.1",
  "fal-ai/kling-video/v3/turbo/standard/text-to-video",
  "lightricks/ltx-2.5/text-to-video/fast",
  "fal-ai/nano-banana-pro",
  "openai/gpt-image-2",
  "fal-ai/flux-2-pro",
  "fal-ai/flux-2/flash",
  "bytedance/seedream/v5/pro/text-to-image",
  "fal-ai/nano-banana-2",
];

// As duas recebem o `t` da interface quando quem chama tem um; sem ele voltam
// ao ingles dos rotulos acima. Isso mantem o modulo utilizavel fora do React
// (os testes de contrato o importam direto, sem provider de idioma).
export function modelKindLabel(model, t) {
  const kind = model?.kind;
  if (t) {
    const key = kind ? `catalog.kindLabels.${kind}` : "catalog.kindLabels.unknown";
    const label = t(key);
    if (label !== key) return label;
  }
  return MODEL_KIND_LABELS[kind] ?? "Model";
}

export function modelLaneLabel(model, t) {
  const lane = model?.lane;
  if (t) {
    const key = lane ? `catalog.laneLabels.${lane}` : "catalog.laneLabels.unknown";
    const label = t(key);
    if (label !== key) return label;
  }
  return MODEL_LANE_LABELS[lane] ?? "General generation";
}

// These two fields are generated from the endpoint's live OpenAPI schema. A
// `pair` is only a navigation hint; it is never enough to prove that a model
// accepts an image.
export function imageInputFor(model) {
  if (model?.capabilities?.primary_image_field) {
    return {
      field: model.capabilities.primary_image_field,
      arity: model.capabilities.image_arity ?? "single",
    };
  }
  if (model?.image_input?.name && model.image_input.arity) {
    return { field: model.image_input.name, arity: model.image_input.arity };
  }
  if (!model?.image_param || !model?.accepts_image) return null;
  return { field: model.image_param, arity: model.accepts_image };
}

export function mediaInputsFor(model, modality) {
  const inputs = model?.capabilities?.inputs ?? [];
  return modality ? inputs.filter((input) => input.modality === modality || input.modality === "mixed") : inputs;
}

export function mediaTypeForFile(file) {
  if (file?.type?.startsWith("image/")) return "image";
  if (file?.type?.startsWith("video/")) return "video";
  if (file?.type?.startsWith("audio/")) return "audio";
  if (file?.type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "")) return "document";
  return "file";
}

export function assignInputFields(model, assets) {
  const usage = new Map();
  const assigned = [];
  for (const asset of assets) {
    const candidates = mediaInputsFor(model, asset.media_type).sort((a, b) => {
      if (a.field === model?.capabilities?.primary_image_field) return -1;
      if (b.field === model?.capabilities?.primary_image_field) return 1;
      if (a.arity === "multiple" && b.arity !== "multiple") return -1;
      if (b.arity === "multiple" && a.arity !== "multiple") return 1;
      return 0;
    });
    const chosen = candidates.find((input) => {
      const count = usage.get(input.field) ?? 0;
      if (input.arity === "single") return count === 0;
      return !input.limits?.max_items || count < input.limits.max_items;
    });
    if (!chosen) return { ok: false, asset, reason: `${model?.label ?? "This model"} has no available ${asset.media_type} input.` };
    usage.set(chosen.field, (usage.get(chosen.field) ?? 0) + 1);
    assigned.push({ ...asset, field: chosen.field });
  }
  return { ok: true, assets: assigned };
}

// Model selection should never feel broken because an old attachment no
// longer fits. Keep every asset the new endpoint can accept, remap its field,
// and return the remainder so the UI can explain what was removed.
export function retainCompatibleAssets(model, assets) {
  let compatible = [];
  const removed = [];
  for (const asset of assets) {
    const assignment = assignInputFields(model, [...compatible, asset]);
    if (assignment.ok) compatible = assignment.assets;
    else removed.push(asset);
  }
  return { assets: compatible, removed };
}

export function pairedImageModel(models, model) {
  const paired = models?.find((candidate) => candidate.id === model?.pair);
  return imageInputFor(paired) ? paired : null;
}

export function modelPriority(model) {
  const exact = MODEL_PRIORITY.indexOf(model.id);
  if (exact !== -1) return exact;

  // Keep reference/image-to-video siblings near their parent model, while
  // keeping the catalog deterministic when new endpoints arrive.
  const family = MODEL_PRIORITY.findIndex((id) => {
    const stem = id.split("/").slice(0, 3).join("/");
    return model.id.startsWith(stem);
  });
  if (family !== -1) return family + 0.4;
  if (model.tier === "fastest") return 30;
  return 100 + (model.kind === "video" ? 1 : 0);
}

export function sortModels(models) {
  return [...models].sort((a, b) => {
    const priority = modelPriority(a) - modelPriority(b);
    if (priority !== 0) return priority;
    return a.label.localeCompare(b.label);
  });
}

// --------------------------------------------------------------- capacidade
// Quantas imagens o modelo aceita, e em quantos campos distintos. O servidor ja
// derivava isso do schema (`capabilities.inputs[].limits.max_items`) e a
// interface simplesmente nao mostrava — quem anexava descobria o teto no erro.
export function imageSlotsFor(model) {
  // Mascara nao e imagem de referencia: somar `mask_url` ao teto fazia o
  // gpt-image-2 anunciar "ate 17 imagens" quando sao 16 + uma mascara.
  return mediaInputsFor(model, "image")
    .filter((input) => !/mask/i.test(input.field))
    .map((input) => ({
    field: input.field,
    arity: input.arity,
    max: input.arity === "single" ? 1 : (input.limits?.max_items ?? null),
  }));
}

// null = aceita imagem sem teto declarado; 0 = nao aceita imagem.
export function imageCapacity(model) {
  const slots = imageSlotsFor(model);
  if (!slots.length) return 0;
  if (slots.some((slot) => slot.max == null)) return null;
  return slots.reduce((total, slot) => total + slot.max, 0);
}

// Modelo de keyframes: dois (ou mais) campos de imagem separados, cada um com
// uma vaga. Sao papeis diferentes — primeiro e ultimo quadro —, entao merecem
// dois seletores, e nao uma lista onde a ordem decide sozinha.
export function keyframeSlotsFor(model) {
  const single = imageSlotsFor(model).filter((slot) => slot.max === 1);
  return single.length >= 2 ? single : null;
}

// Campos de imagem que NAO sao quadro nomeado (ex.: `elements` do Kling v3, sem
// teto). Convivem com os dois quadros: um diz onde o video comeca e termina, o
// outro alimenta o modelo com referencias soltas.
export function extraImageSlotsFor(model) {
  return imageSlotsFor(model).filter((slot) => slot.max !== 1);
}

// O nome do campo vem do schema do provedor e varia (`tailImage`,
// `end_image_url`, `image_tail`). O papel, nao.
export function slotRole(field) {
  const name = String(field ?? "").toLowerCase();
  if (/(tail|end|last|final)/.test(name)) return "last";
  if (/(start|first|head|begin)/.test(name) || name === "image" || name === "image_url") return "first";
  return "other";
}
