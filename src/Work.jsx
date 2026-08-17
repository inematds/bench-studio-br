import React, { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "./i18n/index.jsx";

// Results, big. Each one keeps its own price and billing confidence.

// Os nomes dos formatos vivem no dicionario; aqui fica so a lista dos ids que
// o servidor pode devolver.
const FORMAT_IDS = ["ugc", "unboxing", "hypermotion", "tvspot", "product", "poster"];

// As opcoes de filtro saem dos proprios resultados: um provedor ou modelo que
// voce nunca usou nao tem por que ocupar espaco na barra.
function optionsFrom(shots, pick) {
  const counts = new Map();
  for (const shot of shots) {
    const value = pick(shot);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Work({ job, shots, standalone = false, onDelete, onReuse }) {
  const t = useT();
  const [kind, setKind] = useState("all");
  const [provider, setProvider] = useState("all");
  const [model, setModel] = useState("all");

  const kinds = useMemo(() => optionsFrom(shots, (s) => s.kind), [shots]);
  const providers = useMemo(() => optionsFrom(shots, (s) => s.provider ?? "fal"), [shots]);
  // A lista de modelos acompanha os outros filtros: escolhido o provedor, nao
  // faz sentido oferecer modelos que nao sao dele.
  const models = useMemo(() => optionsFrom(
    shots.filter((s) => (kind === "all" || s.kind === kind) && (provider === "all" || (s.provider ?? "fal") === provider)),
    (s) => s.model,
  ), [shots, kind, provider]);

  const filtered = useMemo(() => shots.filter((s) =>
    (kind === "all" || s.kind === kind)
    && (provider === "all" || (s.provider ?? "fal") === provider)
    && (model === "all" || s.model === model)
  ), [shots, kind, provider, model]);

  // Um modelo escolhido pode deixar de existir na lista quando o provedor muda;
  // sem isto o filtro ficaria travado num resultado vazio, sem explicacao.
  useEffect(() => {
    if (model !== "all" && !models.some(([value]) => value === model)) setModel("all");
  }, [models, model]);

  const filtering = kind !== "all" || provider !== "all" || model !== "all";
  const spent = filtered.reduce((a, s) => a + (Number(s.cost) || 0), 0);

  return (
    <div className={`wall results-wall${standalone ? " standalone" : ""}`}>
      <div className="wall-head">
        <h2>{standalone ? t("work.library") : t("work.yourResults")}</h2>
        <span>
          {filtering
            ? t("work.countOf", { shown: filtered.length, total: shots.length })
            : t("work.count", { count: filtered.length })}
        </span>
        <div className="rule" />
        <span>{t("work.spent", { amount: spent.toFixed(3) })}</span>
      </div>

      {shots.length > 1 && (
        <div className="results-filters" role="group" aria-label={t("work.filterResults")}>
          <Filter label={t("work.filterType")} value={kind} onChange={setKind} options={kinds} total={shots.length} allLabel={t("work.all")} />
          <Filter label={t("work.filterProvider")} value={provider} onChange={setProvider} options={providers} total={shots.length} allLabel={t("work.all")} />
          {models.length > 1 && <Filter label={t("work.filterModel")} value={model} onChange={setModel} options={models} total={filtered.length} allLabel={t("work.all")} wide />}
          {filtering && (
            <button type="button" className="results-filter-clear" onClick={() => { setKind("all"); setProvider("all"); setModel("all"); }}>
              {t("work.clear")}
            </button>
          )}
        </div>
      )}

      {!job && !shots.length ? (
        <div className="results-empty">
          <strong>{t("work.emptyTitle")}</strong>
          <span>{t("work.emptyBody")}</span>
          <a href="#create">{t("work.emptyCta")}</a>
        </div>
      ) : (
        <div className="masonry">
          {job && <Job job={job} />}
          {filtered.map((s) => (
            <Shot key={`${s.archive_id ?? s.request_id}-${s.at}`} shot={s} onDelete={onDelete} onReuse={onReuse} />
          ))}
        </div>
      )}
    </div>
  );
}

function Filter({ label, value, onChange, options, total, allLabel, wide }) {
  if (!options.length) return null;
  return (
    <label className={`results-filter${wide ? " wide" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{allLabel} ({total})</option>
        {options.map(([option, count]) => (
          <option key={option} value={option}>{option} ({count})</option>
        ))}
      </select>
    </label>
  );
}

function Job({ job }) {
  const t = useT();
  return (
    <div className="job">
      <div className="ph pulse">{job.status ?? job.phase}</div>
      <div className="meta">
        <span>{job.model ?? ""}</span>
        <span>
          {job.queue_position != null ? t("work.queue", { position: job.queue_position }) : ""}
          {job.estimate?.cost != null ? ` · ~$${job.estimate.cost.toFixed(3)}` : ""}
        </span>
      </div>
      <div className="bar-lite"><i /></div>
    </div>
  );
}

function Shot({ shot, onDelete, onReuse }) {
  const t = useT();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const verified = shot.cost_confidence === "verified";
  const formatLabel = FORMAT_IDS.includes(shot.format) ? t(`work.formats.${shot.format}`) : null;
  const idea = String(shot.raw_idea || shot.prompt || "").trim();
  const resultLabel = shot.label || t("work.untitled");
  // `params` carrega o prompt junto porque e o payload enviado ao provider; aqui
  // interessa so o que e ajuste de controle.
  //
  // E carrega tambem as REFERENCIAS. Quando a referencia foi enviada como data
  // URI, o valor e o arquivo inteiro em base64 — 2 MB de texto que apareciam
  // despejados na tela de detalhes. Media ja tem lugar proprio logo abaixo (as
  // miniaturas), entao aqui ela nunca deve virar texto.
  const reusableParams = Object.entries(shot.params ?? {})
    .filter(([name, value]) => {
      if (name === "prompt") return false;
      const text = String(value ?? "");
      if (text.startsWith("data:")) return false;
      if (/^https?:\/\//.test(text) && /image|video|\.(png|jpe?g|webp|mp4|mov)/i.test(text)) return false;
      return text.length <= 300;
    });

  async function removeResult() {
    setDeleting(true);
    try {
      await onDelete?.(shot);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="work">
      {shot.outputs.map((o, i) => {
        const source = o.local_url || o.url;
        const isVideo =
          String(o.content_type ?? "").startsWith("video") || /\.mp4($|\?)/.test(source);
        return isVideo ? (
          <VideoPreview key={i} src={source} />
        ) : (
          <img key={i} src={source} alt={resultLabel} loading="lazy" />
        );
      })}

      <span className="work-tag" title={shot.cost_basis}>
        <span className={`dot ${verified ? "verified" : "estimated"}`} />
        {verified ? t("ledger.billed") : t("work.estShort")} ${Number(shot.cost ?? 0).toFixed(3)}
      </span>

      <div className="work-foot">
        <div className="l">
          <div className="work-title">
            <span className="work-name">{resultLabel}</span>
            {formatLabel && <span className="work-format">{formatLabel}</span>}
          </div>
          <div className="work-actions">
            <button type="button" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>
              {detailsOpen ? t("work.hideDetails") : t("work.details")}
            </button>
            {onReuse && (
              <button type="button" onClick={() => onReuse(shot)} aria-label={t("work.reuseAria", { name: resultLabel })} title={t("work.reuseTitle")}>
                {t("work.redo")}
              </button>
            )}
            <a href={shot.outputs[0]?.local_url || shot.outputs[0]?.url} download aria-label={t("work.downloadAria", { name: resultLabel })}>{t("work.download")}</a>
            {onDelete && shot.archive_id && (
              <button type="button" className="work-delete" onClick={() => setConfirmingDelete(true)} aria-label={t("work.deleteAria", { name: resultLabel })}>
                {t("common.delete")}
              </button>
            )}
          </div>
        </div>
        <div className="p">{idea}</div>
        {detailsOpen && (
          <div className="work-details">
            <dl>
              <div><dt>{t("work.model")}</dt><dd>{shot.label}</dd></div>
              <div><dt>{t("work.cost")}</dt><dd>{verified ? t("work.verifiedAmount") : t("work.estimate")} · ${Number(shot.cost ?? 0).toFixed(4)}</dd></div>
              {shot.request_id && <div><dt>{t("work.request")}</dt><dd>{shot.request_id}</dd></div>}
              <div><dt>{t("work.archive")}</dt><dd>{shot.outputs.some((output) => output.local_url) ? t("work.savedLocally") : t("work.remoteOnly")}</dd></div>
            </dl>
            {shot.raw_idea && shot.raw_idea !== shot.prompt && (
              <>
                <strong>{t("work.yourIdea")}</strong>
                <p>{shot.raw_idea}</p>
              </>
            )}
            <strong>{t("work.promptSent")}</strong>
            <p>{shot.prompt}</p>
            {reusableParams.length > 0 && (
              <>
                <strong>{t("work.settings")}</strong>
                <dl>
                  {reusableParams.map(([name, value]) => (
                    <div key={name}><dt>{name.replace(/_/g, " ")}</dt><dd>{String(value)}</dd></div>
                  ))}
                </dl>
              </>
            )}
            {shot.input_assets?.length > 0 && (
              <>
                <strong>{t("work.referencesUsed", { count: shot.input_assets.length })}</strong>
                <div className="work-refs">
                  {shot.input_assets.map((asset, i) => (
                    <img key={i} src={asset.local_url || asset.url} alt={t("work.referenceAlt", { n: i + 1 })} loading="lazy" />
                  ))}
                </div>
              </>
            )}
            {onReuse && (
              <button type="button" className="work-reuse-wide" onClick={() => onReuse(shot)}>
                {t("work.redoWide")}
              </button>
            )}
            {shot.outputs[0]?.remote_url && <a className="hosted-copy" href={shot.outputs[0].remote_url} target="_blank" rel="noreferrer">{t("work.openHosted")}</a>}
          </div>
        )}
        {confirmingDelete && (
          <div className="work-delete-confirm" role="group" aria-label={t("work.confirmDeleteAria", { name: resultLabel })}>
            <div>
              <strong>{t("work.confirmDeleteTitle")}</strong>
              <span>{t("work.confirmDeleteBody")}</span>
            </div>
            <div>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>{t("work.keepIt")}</button>
              <button type="button" className="danger" onClick={removeResult} disabled={deleting}>
                {deleting ? t("work.deleting") : t("work.deleteResult")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoPreview({ src }) {
  const t = useT();
  const videoRef = useRef(null);
  const soundEnabledRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    video.defaultMuted = true;
    video.muted = true;

    const scrollRoot = document.querySelector(".scroll");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!soundEnabledRef.current) video.muted = true;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { root: scrollRoot, rootMargin: "120px 0px", threshold: 0.35 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    soundEnabledRef.current = soundEnabled;
    if (!video) return;
    video.muted = !soundEnabled;
    if (soundEnabled && video.volume === 0) video.volume = 1;
  }, [soundEnabled]);

  const keepSoundIntentional = (event) => {
    const video = event.currentTarget;
    if (!soundEnabledRef.current && !video.muted) {
      video.muted = true;
    } else if (soundEnabledRef.current && video.muted) {
      setSoundEnabled(false);
    }
  };

  return (
    <div className="work-video-shell">
      <video
        ref={videoRef}
        className="work-video"
        src={src}
        controls
        loop
        muted={!soundEnabled}
        playsInline
        preload="metadata"
        onVolumeChange={keepSoundIntentional}
        aria-label={t("work.videoPreviewAria")}
      />
      <button
        type="button"
        className={`work-sound-toggle${soundEnabled ? " enabled" : ""}`}
        onClick={() => setSoundEnabled((enabled) => !enabled)}
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? t("work.mute") : t("work.unmute")}
      >
        {soundEnabled ? t("work.soundOn") : t("work.muted")}
      </button>
    </div>
  );
}
