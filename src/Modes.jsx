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
  // O texto da linha "adicionar" de cada subcontrole, enquanto e digitado. Sem
  // isto, `value=""` com commit no onChange criaria uma opcao por TECLA.
  const [novas, setNovas] = useState({});

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
        // Cada opcao e uma linha propria; o trim so acontece aqui, no envio.
        // Aparar a cada tecla apagava o espaco no instante em que era digitado —
        // "selfie de mao" virava "selfiedemao".
        body: JSON.stringify({
          ...draft,
          ...(editingId ? { id: editingId } : {}),
          controls: draft.controls.map((c) => ({
            ...c,
            options: (c.options ?? []).map((o) => String(o).trim()).filter(Boolean),
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
        id: c.id,
        // Submodo de fabrica traz `key` de traducao; ao editar, o que fica e o
        // texto visivel — dali em diante o rotulo e seu, nao do dicionario.
        label: c.label ?? (c.key ? t(c.key) : c.id),
        options: (c.options ?? []).map((o) => (typeof o === "string" ? o : o.value)),
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

  function setOption(ci, oi, value) {
    setControl(ci, { options: draft.controls[ci].options.map((o, i) => (i === oi ? value : o)) });
  }

  // A ultima linha da lista e a de adicionar: escreve e confirma com Enter (ou
  // saindo do campo), e ela ja abre a proxima. Nenhum botao "adicionar opcao".
  function commitNewOption(ci) {
    const texto = String(novas[ci] ?? "").trim();
    if (!texto) return;
    setControl(ci, { options: [...(draft.controls[ci].options ?? []), texto] });
    setNovas((n) => ({ ...n, [ci]: "" }));
  }

  function removeOption(ci, oi) {
    setControl(ci, { options: draft.controls[ci].options.filter((_, i) => i !== oi) });
  }

  const emEdicao = (id) => editingId === id;

  return (
    <section className="modes-page">
      <div className="modes-hero">
        <div>
          <div className="eyebrow">{t("modes.eyebrow")}</div>
          <h1>{editingId ? t("modes.editTitle") : t("modes.createTitle")}</h1>
          <p dangerouslySetInnerHTML={{ __html: t("modes.intro") }} />
        </div>
      </div>

      {/* Nomes de modo sao curtos; a lista cabe numa coluna estreita e o editor
          fica sempre a vista, sem rolar a pagina para achar o que se edita. */}
      <div className="modes-layout">
        <aside className="modes-side">
          <div className="modes-side-group">
            <h2>{t("modes.yourModes")} <span>{custom.length}</span></h2>
            {!custom.length && <p className="modes-hint">{t("modes.noCustomModes")}</p>}
            {custom.map((mode) => (
              <div className={`modes-item${emEdicao(mode.id) ? " on" : ""}`} key={mode.id}>
                <button type="button" className="modes-item-name" onClick={() => edit(mode)}>{mode.label}</button>
                <button type="button" className="modes-item-x" onClick={() => remove(mode.id)} title={t("common.delete")} aria-label={t("common.delete")}>×</button>
              </div>
            ))}
          </div>

          <div className="modes-side-group">
            <h2>{t("modes.builtin")} <span>{builtin.length}</span></h2>
            {builtin.map((mode) => (
              <div className={`modes-item${emEdicao(mode.id) ? " on" : ""}`} key={mode.id}>
                <button type="button" className="modes-item-name" onClick={() => edit(mode)}>
                  {mode.label}
                  {mode.edited && <i className="modes-dot" title={t("modes.edited")} />}
                </button>
                {mode.edited && (
                  <button type="button" className="modes-item-x" onClick={() => restore(mode.id)} title={t("modes.restore")} aria-label={t("modes.restore")}>↺</button>
                )}
                <button type="button" className="modes-item-x" onClick={() => remove(mode.id)} title={t("modes.hide")} aria-label={t("modes.hide")}>–</button>
              </div>
            ))}
          </div>

          {hidden.length > 0 && (
            <div className="modes-side-group">
              <h2>{t("modes.hiddenTitle")} <span>{hidden.length}</span></h2>
              {hidden.map((mode) => (
                <div className="modes-item off" key={mode.id}>
                  <span className="modes-item-name">{mode.label}</span>
                  <button type="button" className="modes-item-x" onClick={() => restore(mode.id)} title={t("modes.restore")} aria-label={t("modes.restore")}>↺</button>
                </div>
              ))}
            </div>
          )}
        </aside>

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
              <button type="button" onClick={() => setDraft((d) => ({ ...d, controls: [...d.controls, { label: "", options: [] }] }))}>
                {t("modes.addSubControl")}
              </button>
            </div>
            {!draft.controls.length && <p className="modes-hint">{t("modes.noSubControlsHint")}</p>}

            {/* Nome do subcontrole em cima, opcoes embaixo, uma por linha, e a
                ultima linha vazia esperando a proxima. */}
            {draft.controls.map((control, i) => (
              <div className="modes-control" key={i}>
                <div className="modes-control-head">
                  <input
                    className="modes-control-label"
                    value={control.label}
                    placeholder={t("modes.controlLabelPlaceholder")}
                    onChange={(e) => setControl(i, { label: e.target.value })}
                  />
                  <button
                    type="button"
                    className="modes-remove"
                    onClick={() => setDraft((d) => ({ ...d, controls: d.controls.filter((_, j) => j !== i) }))}
                    aria-label={t("modes.removeSubControl")}
                  >×</button>
                </div>
                <div className="modes-options">
                  {(control.options ?? []).map((option, oi) => (
                    <div className="modes-option" key={oi}>
                      <input value={option} onChange={(e) => setOption(i, oi, e.target.value)} />
                      <button type="button" className="modes-remove" onClick={() => removeOption(i, oi)} aria-label={t("modes.removeOption")}>×</button>
                    </div>
                  ))}
                  <div className="modes-option add">
                    <input
                      value={novas[i] ?? ""}
                      placeholder={t("modes.addOption")}
                      onChange={(e) => setNovas((n) => ({ ...n, [i]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitNewOption(i); } }}
                      onBlur={() => commitNewOption(i)}
                    />
                  </div>
                </div>
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
      </div>
    </section>
  );
}
