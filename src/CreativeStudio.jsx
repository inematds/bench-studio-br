import React, { useEffect, useMemo, useRef, useState } from "react";
import { useT, translate, detectLang } from "./i18n/index.jsx";

// Os textos de cada modo vivem no dicionario (`creative.website.*` e
// `creative.document.*`); aqui fica so a estrutura — quais direcoes iniciais
// existem, na ordem em que aparecem.
const TEMPLATES = {
  website: ["immersive", "editorial", "product"],
  document: ["editorial-report", "presentation", "field-guide"],
};

async function json(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    // Mesma regra do App: codigo traduzido quando existir, frase do servidor
    // quando nao. Aqui o `t` nao esta disponivel (a funcao vive fora do
    // componente), entao resolve pelo idioma detectado.
    const key = payload.code ? `server.${payload.code}` : null;
    const translated = key ? translate(detectLang(), key) : null;
    throw new Error((translated && translated !== key ? translated : null)
      || payload.error
      || `${response.status}`);
  }
  return payload;
}

function relativeTime(value, t) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return t("creative.justNow");
  if (seconds < 3600) return t("creative.minutesAgo", { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t("creative.hoursAgo", { n: Math.floor(seconds / 3600) });
  return t("creative.daysAgo", { n: Math.floor(seconds / 86400) });
}

export default function CreativeStudio({ kind }) {
  const t = useT();
  const templates = TEMPLATES[kind];
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState(templates[0]);
  const [reasoning, setReasoning] = useState("low");
  const [projects, setProjects] = useState([]);
  const [reference, setReference] = useState(null);
  const loadReferenceRef = useRef(() => {});
  const [error, setError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const active = useMemo(() => projects.find((project) => ["queued", "running"].includes(project.status)), [projects]);
  const completed = useMemo(() => projects.filter((project) => project.status === "complete"), [projects]);
  const failed = useMemo(() => projects.filter((project) => project.status === "failed"), [projects]);

  async function reviseProject(id, instruction) {
    try {
      const project = await json(`/api/projects/${id}/revise`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction }) });
      setProjects((rows) => rows.map((row) => row.id === id ? project : row));
    } catch (e) { setError(String(e.message ?? e)); }
  }

  async function revertProject(id) {
    try {
      const project = await json(`/api/projects/${id}/revert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setProjects((rows) => rows.map((row) => row.id === id ? project : row));
    } catch (e) { setError(String(e.message ?? e)); }
  }

  async function removeProject(id) {
    try {
      const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error);
      setProjects((rows) => rows.filter((row) => row.id !== id));
    } catch (e) { setError(String(e.message ?? e)); }
  }
  const history = useMemo(() => projects.filter((project) => !["complete", "queued", "running", "failed"].includes(project.status)), [projects]);

  useEffect(() => {
    setTemplate(TEMPLATES[kind][0]);
    setError("");
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let dead = false;
    const load = () => json(`/api/projects?kind=${kind}`).then((result) => {
      if (!dead) {
        setProjects(result.rows);
        setLibraryError("");
        setLoadingProjects(false);
      }
    }).catch(() => {
      if (!dead) {
        setLibraryError(t("creative.archiveOfflineBody"));
        setLoadingProjects(false);
      }
    });
    load();
    json("/api/creative-references").then((result) => !dead && setReference(result[kind])).catch(() => {});
    loadReferenceRef.current = () => json("/api/creative-references").then((r) => setReference(r[kind])).catch(() => {});
    const timer = setInterval(load, 1800);
    return () => { dead = true; clearInterval(timer); };
  }, [kind, t]);

  async function build() {
    setSubmitting(true);
    setError("");
    try {
      const project = await json("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, prompt, template, model: "gpt-5.6-sol", reasoning }),
      });
      setProjects((rows) => [project, ...rows]);
      setTitle("");
      setPrompt("");
    } catch (buildError) {
      setError(buildError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id) {
    const project = await json(`/api/projects/${id}/cancel`, { method: "POST" });
    setProjects((rows) => rows.map((row) => row.id === id ? project : row));
  }

  return (
    <section className={`creative-studio creative-${kind}`}>
      <header className="creative-head">
        <div>
          <div className="eyebrow">{t(`creative.${kind}.eyebrow`)}</div>
          <h1>{t(`creative.${kind}.headline`)}</h1>
          <p>{t(`creative.${kind}.subhead`)}</p>
        </div>
      </header>

      <div className="creative-composer">
        <div className="creative-form">
          <label>
            <span>{t(`creative.${kind}.titleLabel`)}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t(`creative.${kind}.titlePlaceholder`)} />
          </label>
          <label>
            <span>{t("creative.brief")}</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t(`creative.${kind}.briefPlaceholder`)} />
            <small>{t("creative.briefHint")}</small>
          </label>

          <fieldset className="direction-picker">
            <legend>{t("creative.startingDirection")}</legend>
            <div>
              {templates.map((id) => (
                <button type="button" key={id} className={template === id ? "active" : ""} onClick={() => setTemplate(id)}>
                  <strong>{t(`creative.templates.${id}.label`)}</strong><span>{t(`creative.templates.${id}.note`)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="creative-submit-row">
            <div className="craft-control">
              <span>{t("creative.buildDepth")}</span>
              <button type="button" className={reasoning === "low" ? "active" : ""} onClick={() => setReasoning("low")}>{t("creative.fast")}</button>
              <button type="button" className={reasoning === "medium" ? "active" : ""} onClick={() => setReasoning("medium")}>{t("creative.considered")}</button>
            </div>
            <button type="button" className="creative-primary" onClick={build} disabled={submitting || Boolean(active) || !title.trim() || prompt.trim().length < 20}>
              {submitting ? t("creative.starting") : active ? t("creative.inProgress") : t(`creative.${kind}.button`)}
            </button>
          </div>
          {error && <p className="creative-error" role="alert">{error}</p>}
        </div>

        <aside className="creative-reference">
          <div className="reference-frame">
            {kind === "website" && reference?.preview_url ? (
              <iframe title={t("creative.websiteReference")} src={reference.preview_url} loading="lazy" />
            ) : reference?.preview_url ? (
              <object title={t("creative.documentReference")} data={reference.preview_url} type="application/pdf" />
            ) : <div className="reference-offline">{t("creative.noReference")}</div>}
          </div>
          <ReferenceConfig kind={kind} reference={reference} onSaved={() => loadReferenceRef.current()} />
          <div className="reference-copy">
            <span>{t("creative.craftReference")}</span>
            <strong>{reference?.name ?? (kind === "website" ? t("creative.websiteReference") : t("creative.documentReference"))}</strong>
            <p>{reference?.description}</p>
            {reference?.preview_url && <a href={reference.preview_url} target="_blank" rel="noreferrer">{t("creative.openReferenceArrow")}</a>}
          </div>
        </aside>
      </div>

      {active && <BuildProgress project={active} onCancel={() => cancel(active.id)} />}

      <section className="project-library">
        <div className="project-library-head">
          <div>
            <span className="project-library-kicker">{t("creative.completedWork")}</span>
            <h2>{kind === "website" ? t("creative.yourWebsites") : t("creative.yourDocuments")}</h2>
          </div>
          <span>{loadingProjects ? t("common.loading") : libraryError ? t("creative.archiveOffline") : kind === "website"
            ? `${t("creative.nGenerated", { count: completed.length })}${reference?.preview_url ? t("creative.plusOneReference") : ""}`
            : t("creative.nPdfs", { count: completed.length })}</span>
        </div>
        {libraryError ? (
          <div className="project-empty project-empty-error"><strong>{t("creative.archiveOfflineTitle")}</strong><span>{libraryError}</span></div>
        ) : loadingProjects ? (
          <div className="project-loading" aria-label={t("creative.loadingProjects")}><i /><i /><i /></div>
        ) : !completed.length && !(kind === "website" && reference?.preview_url) ? (
          <div className="project-empty">{kind === "website" ? t("creative.emptyWebsite") : t("creative.emptyDocument")}</div>
        ) : (
          <div className="project-grid">
            {kind === "website" && reference?.preview_url && <WebsiteReferenceCard reference={reference} />}
            {completed.map((project) => <ProjectCard key={project.id} project={project} onDelete={removeProject} onRevise={reviseProject} onRevert={revertProject} />)}
          </div>
        )}

        {failed.length > 0 && (
          <div className="project-failed-list">
            {failed.map((project) => <FailedCard key={project.id} project={project} onDelete={removeProject} onRevise={reviseProject} onRevert={revertProject} />)}
          </div>
        )}

        {history.length > 0 && (
          <details className="project-history">
            <summary>{t("creative.buildHistory")} <span>{history.length}</span></summary>
            <div>
              {history.map((project) => (
                <article key={project.id}>
                  <div><strong>{project.title}</strong><span>{project.status} · {relativeTime(project.updated_at, t)}</span></div>
                  {project.error && <p>{project.error}</p>}
                </article>
              ))}
            </div>
          </details>
        )}
      </section>
    </section>
  );
}

// Uma build que falhou ainda deixa coisa em disco — e as vezes quase tudo. Some-la
// numa lista recolhida joga fora trabalho ja feito (e, num provedor pago, ja pago).
// Aqui o motivo real aparece inteiro e cada arquivo pode ser aberto e editado.
// Painel de arquivos + editor. Serve tanto para build concluida quanto para
// build que falhou: nos dois casos o que esta em disco e a unica verdade, e
// poder corrigir a mao evita refazer (e repagar) a geracao inteira por causa de
// um detalhe.
function ProjectFiles({ project, onRevise, onRevert }) {
  const t = useT();
  const [editing, setEditing] = useState(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);
  const produced = (project.files ?? []).filter((f) => !f.internal);
  const logs = (project.files ?? []).filter((f) => f.internal);

  async function openFile(file) {
    setStatus("");
    setEditing(file);
    try {
      const r = await fetch(`/api/projects/${project.id}/file?name=${encodeURIComponent(file.name)}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setContent(j.content);
    } catch (e) { setStatus(String(e.message ?? e)); }
  }

  async function saveFile() {
    setStatus(t("common.saving"));
    try {
      const r = await fetch(`/api/projects/${project.id}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, content }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setStatus(t("common.saved"));
    } catch (e) { setStatus(String(e.message ?? e)); }
  }

  async function revise() {
    if (instruction.trim().length < 4) return;
    setSending(true);
    try { await onRevise(project.id, instruction.trim()); setInstruction(""); }
    finally { setSending(false); }
  }

  return (
    <div className="project-files">
      {onRevise && (
        <div className="project-revise">
          <label htmlFor={`revise-${project.id}`}>{t("creative.askChange")}</label>
          <textarea
            id={`revise-${project.id}`}
            rows={2}
            value={instruction}
            placeholder={t("creative.askChangePlaceholder")}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="project-revise-actions">
            <button type="button" className="project-revise-send" onClick={revise} disabled={sending || instruction.trim().length < 4}>
              {sending ? t("creative.sending") : t("creative.applyChange")}
            </button>
            {project.snapshots?.length > 0 && onRevert && (
              <button type="button" onClick={() => onRevert(project.id)} title={t("creative.undoTitle", { when: relativeTime(project.snapshots[0].at, t) })}>
                {t("creative.undoLast", { count: project.snapshots.length })}
              </button>
            )}
            <span>{t("creative.copyBeforeChange")}</span>
          </div>
        </div>
      )}
            {!produced.length && <p className="modes-hint">{t("creative.noFiles")}</p>}
            {produced.map((f) => (
              <button type="button" key={f.name} className="project-file" onClick={() => openFile(f)} disabled={!f.editable}>
                <b>{f.name}</b><small>{(f.size_bytes / 1024).toFixed(1)} kB</small>
              </button>
            ))}
            {project.bundle_url && (
              <a className="project-file project-file-download" href={`${project.bundle_url}?download=1`}>
                <b>{t("creative.downloadAll")}</b><small>{t("creative.nFiles", { count: produced.length })}</small>
              </a>
            )}
            {logs.length > 0 && (
              <details className="project-logs">
                <summary>{t("creative.buildLog", { count: logs.length })}</summary>
                {logs.map((f) => (
                  <button type="button" key={f.name} className="project-file" onClick={() => openFile(f)}>
                    <b>{f.name}</b><small>{(f.size_bytes / 1024).toFixed(1)} kB</small>
                  </button>
                ))}
              </details>
            )}
      {editing && (
        <div className="project-editor">
          <div className="project-editor-head">
            <strong>{editing.name}</strong>
            <div>
              <span>{status}</span>
              <button type="button" onClick={saveFile}>{t("common.save")}</button>
              <button type="button" onClick={() => { setEditing(null); setStatus(""); }}>{t("common.close")}</button>
            </div>
          </div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
        </div>
      )}
    </div>
  );
}

function FailedCard({ project, onDelete, onRevise, onRevert }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const produced = (project.files ?? []).filter((f) => !f.internal);
  return (
    <article className="project-card project-card-failed">
      <div className="project-card-body">
        <div><span className="project-status failed">{t("creative.buildFailed")}</span><small>{relativeTime(project.updated_at, t)}</small></div>
        <h3>{project.title}</h3>
        {project.error && <p className="project-failed-reason">{project.error}</p>}
        <div className="project-actions">
          <button type="button" onClick={() => setOpen((v) => !v)}>
            {open ? t("creative.hideFiles") : t("creative.filesCount", { count: produced.length })}
          </button>
          {produced.some((f) => /index\.html?$/i.test(f.name)) && (
            <a className="project-open" href={`/projects/${project.id}/index.html`} target="_blank" rel="noreferrer">{t("creative.openAnyway")}</a>
          )}
          {onDelete && <DeleteProject project={project} onDelete={onDelete} />}
        </div>
        {open && <ProjectFiles project={project} onRevise={onRevise} onRevert={onRevert} />}
      </div>
    </article>
  );
}

// Apagar e irreversivel e leva os arquivos do disco junto, entao pede confirmacao
// no lugar de um clique solto ao lado de "Open".
function DeleteProject({ project, onDelete }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) return <button type="button" className="project-delete" onClick={() => setConfirming(true)}>{t("common.delete")}</button>;
  return (
    <span className="project-delete-confirm">
      <span>{t("creative.confirmDelete", { title: project.title })}</span>
      <button type="button" onClick={() => setConfirming(false)} disabled={busy}>{t("creative.keep")}</button>
      <button
        type="button"
        className="danger"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onDelete(project.id); } finally { setBusy(false); } }}
      >{busy ? t("work.deleting") : t("common.delete")}</button>
    </span>
  );
}

// A referencia de craft e um alvo de qualidade, nao um molde: o construtor pode
// olhar para calibrar acabamento e e proibido de copiar marca, texto, estrutura
// ou assets. Antes so dava para apontar por variavel de ambiente, o que exigia
// editar arquivo e reiniciar — e por isso ficava vazia para sempre.
function ReferenceConfig({ kind, reference, onSaved }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPath(reference?.path ?? "");
    setUrl(reference?.url ?? "");
  }, [reference?.path, reference?.url]);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const body = kind === "website"
        ? { website_reference: path, website_reference_url: url }
        : { document_reference: path };
      await json("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await onSaved();
      setStatus(t("common.saved"));
      setOpen(false);
    } catch (e) { setStatus(String(e.message ?? e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="reference-config">
      <button type="button" className="reference-config-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? t("common.close") : reference?.path ? t("creative.changeReference") : t("creative.setReference")}
      </button>
      {reference?.path && !open && (
        <span className={`reference-state${reference.exists ? "" : " missing"}`}>
          {reference.exists ? reference.path : t("creative.referenceNotFound", { path: reference.path })}
        </span>
      )}
      {open && (
        <div className="reference-config-form">
          <label>
            <span>{kind === "website" ? t("creative.pathToSite") : t("creative.pathToDocument")}</span>
            <input value={path} placeholder="/home/voce/projetos/site/guia/index.html" onChange={(e) => setPath(e.target.value)} />
          </label>
          {kind === "website" && (
            <label>
              <span>{t("creative.previewUrl")}</span>
              <input value={url} placeholder="http://localhost:5300/" onChange={(e) => setUrl(e.target.value)} />
            </label>
          )}
          <div className="reference-config-actions">
            <button type="button" onClick={save} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
            <button type="button" onClick={() => { setPath(""); setUrl(""); }}>{t("work.clear")}</button>
            {status && <span>{status}</span>}
          </div>
          <p>{t("creative.referenceRules")}</p>
        </div>
      )}
    </div>
  );
}

function WebsiteReferenceCard({ reference }) {
  const t = useT();
  return (
    <article className="project-card project-reference-card">
      <div className="project-preview">
        <iframe title={t("creative.referenceFrameTitle", { name: reference.name })} src={reference.preview_url} loading="lazy" />
        <span className="project-type project-type-reference">{t("creative.craftReference")}</span>
      </div>
      <div className="project-card-body">
        <div><span className="project-status">{t("creative.reference")}</span><small>{t("creative.designBenchmark")}</small></div>
        <h3>{reference.name}</h3>
        <p>{reference.description}</p>
        <div className="project-actions">
          <a className="project-open" href={reference.preview_url} target="_blank" rel="noreferrer">{t("creative.openReference")}</a>
        </div>
      </div>
    </article>
  );
}

function BuildProgress({ project, onCancel }) {
  const t = useT();
  return (
    <section className="build-progress" aria-live="polite">
      <div className="build-progress-copy"><span>{t("creative.buildingNow")}</span><strong>{project.title}</strong><small>{project.stage}</small></div>
      <div className="build-meter"><i style={{ width: `${Math.max(3, project.progress)}%` }} /></div>
      <b>{project.progress}%</b>
      <button type="button" onClick={onCancel}>{t("common.cancel")}</button>
    </section>
  );
}

function ProjectCard({ project, onDelete, onRevise, onRevert }) {
  const t = useT();
  const [showFiles, setShowFiles] = useState(false);
  const complete = project.status === "complete";
  const isWebsite = project.kind === "website";
  const resultUrl = isWebsite ? project.preview_url : project.artifact_file;
  return (
    <article className={`project-card status-${project.status}`}>
      <div className="project-preview">
        {complete && isWebsite && project.preview_url ? (
          <iframe title={t("creative.sitePreviewTitle", { title: project.title })} src={project.preview_url} loading="lazy" />
        ) : complete && project.artifact_file ? (
          <object title={t("creative.pdfPreviewTitle", { title: project.title })} data={`${project.artifact_file}#page=1&view=FitH`} type="application/pdf">
            <a href={project.artifact_file}>{t("creative.openNamed", { title: project.title })}</a>
          </object>
        ) : <span>{project.progress}%</span>}
        {complete && <span className="project-type">{isWebsite ? t("creative.liveSite") : "PDF"}</span>}
      </div>
      <div className="project-card-body">
        <div><span className="project-status">{t("creative.ready")}</span><small>{relativeTime(project.updated_at, t)}</small></div>
        <h3>{project.title}</h3>
        <p>{project.prompt}</p>
        <div className="project-actions">
          {complete && resultUrl && <a className="project-open" href={resultUrl} target="_blank" rel="noreferrer">{isWebsite ? t("creative.openSite") : t("creative.openPdf")}</a>}
          {complete && !isWebsite && project.artifact_file && <a href={project.artifact_file} download>{t("work.download")}</a>}
          {complete && !isWebsite && project.preview_url && <a href={project.preview_url} target="_blank" rel="noreferrer">{t("creative.editableHtml")}</a>}
          {complete && (
            <button type="button" onClick={() => setShowFiles((v) => !v)}>
              {showFiles ? t("creative.hideSource") : t("creative.sourceCount", { count: (project.files ?? []).filter((f) => !f.internal).length })}
            </button>
          )}
          {onDelete && <DeleteProject project={project} onDelete={onDelete} />}
          {project.status === "failed" && <span title={project.error}>{t("creative.buildFailed")}</span>}
        </div>
        {showFiles && <ProjectFiles project={project} onRevise={onRevise} onRevert={onRevert} />}
      </div>
    </article>
  );
}
