import React, { useEffect, useState } from "react";
import { useT } from "./i18n/index.jsx";

// Aba Modes: criar e editar modos sem tocar em código.
//
// Um modo é duas coisas:
//   1. o BRIEF — o texto que entra no refinador quando o modo está ativo. É ele
//      que faz "UGC ad" soar como anúncio de criador e não como comercial;
//   2. os SUBMODOS — os seletores opcionais (Creator, Setting, Beat, Camera no
//      UGC). O que você escolhe neles vira "Creative direction: ..." no fim do
//      prompt.
//
// Os modos de fábrica continuam no código e aparecem aqui como leitura, para
// servir de exemplo de brief bem escrito.

const VAZIO = { label: "", brief: "", controls: [] };

// A barra de criacao carrega o catalogo uma vez, no load da pagina. Trocar de
// aba e so mudanca de hash, entao sem avisar ninguem o modo novo so apareceria
// la depois de um refresh manual.
function notifyChanged() {
  window.dispatchEvent(new CustomEvent("bench:modes-changed"));
}

export default function Modes() {
  const t = useT();
  const [builtin, setBuiltin] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [custom, setCustom] = useState([]);
  const [draft, setDraft] = useState(VAZIO);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/modes");
      const j = await r.json();
      setBuiltin(j.builtin ?? []);
      setHidden(j.hidden ?? []);
      setCustom(j.custom ?? []);
    } catch (e) { setError(String(e.message ?? e)); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // As opcoes ficam como texto cru enquanto se digita e so viram lista aqui.
        // Dividir e dar trim a cada tecla apagava o espaco no instante em que ele
        // era digitado — "selfie de mao" virava "selfiedemao".
        body: JSON.stringify({
          ...draft,
          ...(editingId ? { id: editingId } : {}),
          controls: draft.controls.map((c) => ({
            ...c,
            options: String(c.optionsText ?? "").split(",").map((o) => o.trim()).filter(Boolean),
          })),
        }),
      });
      const j = await r.json();
      if (j.error || j.code) throw new Error(j.code ? t(`server.${j.code}`) : j.error);
      setDraft(VAZIO);
      setEditingId(null);
      await load();
      notifyChanged();
    } catch (e) { setError(String(e.message ?? e)); }
    finally { setSaving(false); }
  }

  async function remove(id) {
    await fetch(`/api/modes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (editingId === id) { setDraft(VAZIO); setEditingId(null); }
    await load();
    notifyChanged();
  }

  function edit(mode) {
    setDraft({
      label: mode.label,
      brief: mode.brief,
      controls: (mode.controls ?? []).map((c) => ({
        ...c,
        optionsText: (c.options ?? []).map((o) => (typeof o === "string" ? o : o.value)).join(", "),
      })),
    });
    setEditingId(mode.id);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Modo de fabrica nao e apagado nem restaurado como um modo seu: o original
  // vive no codigo e continua la. "Esconder" tira da barra; "restaurar" desfaz
  // tanto o esconder quanto qualquer edicao.
  async function restore(id) {
    await fetch(`/api/modes/${encodeURIComponent(id)}/restore`, { method: "POST" });
    if (editingId === id) { setDraft(VAZIO); setEditingId(null); }
    await load();
    notifyChanged();
  }

  function setControl(index, patch) {
    setDraft((d) => ({ ...d, controls: d.controls.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  return (
    <section className="modes-page">
      <div className="modes-hero">
        <div>
          <div className="eyebrow">{t("modes.eyebrow")}</div>
          <h1>{editingId ? t("modes.editTitle") : t("modes.createTitle")}</h1>
          <p dangerouslySetInnerHTML={{ __html: t("modes.intro") }} />
        </div>
      </div>

      <div className="modes-form">
        <label>
          <span>{t("modes.nameLabel")}</span>
          <input
            value={draft.label}
            placeholder={t("modes.namePlaceholder")}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </label>

        <label>
          <span>{t("modes.briefLabel")}</span>
          <textarea
            rows={6}
            value={draft.brief}
            placeholder={t("modes.briefPlaceholder")}
            onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
          />
        </label>

        <div className="modes-controls">
          <div className="modes-controls-head">
            <strong>{t("modes.subControls")}</strong>
            <button type="button" onClick={() => setDraft((d) => ({ ...d, controls: [...d.controls, { label: "", optionsText: "" }] }))}>
              {t("modes.addSubControl")}
            </button>
          </div>
          {!draft.controls.length && <p className="modes-hint">{t("modes.noSubControlsHint")}</p>}
          {draft.controls.map((control, i) => (
            <div className="modes-control" key={i}>
              <input
                className="modes-control-label"
                value={control.label}
                placeholder={t("modes.controlLabelPlaceholder")}
                onChange={(e) => setControl(i, { label: e.target.value })}
              />
              <input
                className="modes-control-options"
                value={control.optionsText ?? ""}
                placeholder={t("modes.controlOptionsPlaceholder")}
                onChange={(e) => setControl(i, { optionsText: e.target.value })}
              />
              <button type="button" className="modes-remove" onClick={() => setDraft((d) => ({ ...d, controls: d.controls.filter((_, j) => j !== i) }))} aria-label={t("modes.removeSubControl")}>×</button>
            </div>
          ))}
        </div>

        {error && <div className="modes-error">{error}</div>}

        <div className="modes-actions">
          <button type="button" className="modes-save" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : editingId ? t("modes.saveChanges") : t("modes.createMode")}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setDraft(VAZIO); setEditingId(null); }}>{t("common.cancel")}</button>
          )}
        </div>
      </div>

      <div className="modes-list">
        <h2>{t("modes.yourModes")} <span>{custom.length}</span></h2>
        {!custom.length && <p className="modes-hint">{t("modes.noCustomModes")}</p>}
        {custom.map((mode) => (
          <article className="modes-card" key={mode.id}>
            <div className="modes-card-head">
              <strong>{mode.label}</strong>
              <div>
                <button type="button" onClick={() => edit(mode)}>{t("modes.edit")}</button>
                <button type="button" className="danger" onClick={() => remove(mode.id)}>{t("common.delete")}</button>
              </div>
            </div>
            <p>{mode.brief}</p>
            {mode.controls?.length > 0 && (
              <ul className="modes-card-controls">
                {mode.controls.map((c) => (
                  <li key={c.id}><b>{c.label}:</b> {c.options.map((o) => o.label).join(" · ")}</li>
                ))}
              </ul>
            )}
          </article>
        ))}

        <h2>{t("modes.builtin")} <span>{builtin.length}</span></h2>
        <p className="modes-hint" dangerouslySetInnerHTML={{ __html: t("modes.builtinHint") }} />
        {builtin.map((mode) => (
          <article className="modes-card builtin" key={mode.id}>
            <div className="modes-card-head">
              <strong>{mode.label}</strong>
              <div className="modes-card-actions">
                {mode.edited && <span className="modes-badge">{t("modes.edited")}</span>}
                <button type="button" onClick={() => edit(mode)}>{t("modes.edit")}</button>
                {mode.edited && (
                  <button type="button" onClick={() => restore(mode.id)}>{t("modes.restore")}</button>
                )}
                <button type="button" className="danger" onClick={() => remove(mode.id)}>{t("modes.hide")}</button>
              </div>
            </div>
            <p>{mode.brief || <em>{t("modes.noInstruction")}</em>}</p>
          </article>
        ))}

        {hidden.length > 0 && (
          <>
            <h2>{t("modes.hiddenTitle")} <span>{hidden.length}</span></h2>
            <p className="modes-hint">{t("modes.hiddenHint")}</p>
            {hidden.map((mode) => (
              <article className="modes-card builtin hidden-mode" key={mode.id}>
                <div className="modes-card-head">
                  <strong>{mode.label}</strong>
                  <div className="modes-card-actions">
                    <button type="button" onClick={() => restore(mode.id)}>{t("modes.restore")}</button>
                  </div>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
