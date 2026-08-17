import React, { useEffect, useState } from "react";

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
  const [builtin, setBuiltin] = useState([]);
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
      if (j.error) throw new Error(j.error);
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

  function setControl(index, patch) {
    setDraft((d) => ({ ...d, controls: d.controls.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  return (
    <section className="modes-page">
      <div className="modes-hero">
        <div>
          <div className="eyebrow">Modes</div>
          <h1>{editingId ? "Edit a mode." : "Create a mode."}</h1>
          <p>
            O <strong>brief</strong> é a instrução que o refinador recebe quando este modo
            estiver ativo. Os <strong>submodos</strong> viram seletores na barra de criação, e o
            que você escolher entra no prompt como direção criativa.
          </p>
        </div>
      </div>

      <div className="modes-form">
        <label>
          <span>Nome do modo</span>
          <input
            value={draft.label}
            placeholder="Reels INEMA"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </label>

        <label>
          <span>Brief — o que este modo instrui</span>
          <textarea
            rows={6}
            value={draft.brief}
            placeholder="Um plano vertical de rede social, com gancho nos 3 primeiros segundos, uma tese só, sem montagem e sem texto na imagem…"
            onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
          />
        </label>

        <div className="modes-controls">
          <div className="modes-controls-head">
            <strong>Submodos (opcional)</strong>
            <button type="button" onClick={() => setDraft((d) => ({ ...d, controls: [...d.controls, { label: "", optionsText: "" }] }))}>
              Adicionar submodo
            </button>
          </div>
          {!draft.controls.length && <p className="modes-hint">Sem submodos, o modo aplica só o brief.</p>}
          {draft.controls.map((control, i) => (
            <div className="modes-control" key={i}>
              <input
                className="modes-control-label"
                value={control.label}
                placeholder="Câmera"
                onChange={(e) => setControl(i, { label: e.target.value })}
              />
              <input
                className="modes-control-options"
                value={control.optionsText ?? ""}
                placeholder="selfie de mão, tripé fixo, plano detalhe (separe por vírgula)"
                onChange={(e) => setControl(i, { optionsText: e.target.value })}
              />
              <button type="button" className="modes-remove" onClick={() => setDraft((d) => ({ ...d, controls: d.controls.filter((_, j) => j !== i) }))} aria-label="Remover submodo">×</button>
            </div>
          ))}
        </div>

        {error && <div className="modes-error">{error}</div>}

        <div className="modes-actions">
          <button type="button" className="modes-save" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar modo"}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setDraft(VAZIO); setEditingId(null); }}>Cancelar</button>
          )}
        </div>
      </div>

      <div className="modes-list">
        <h2>Seus modos <span>{custom.length}</span></h2>
        {!custom.length && <p className="modes-hint">Nenhum modo criado ainda. Os de fábrica continuam disponíveis.</p>}
        {custom.map((mode) => (
          <article className="modes-card" key={mode.id}>
            <div className="modes-card-head">
              <strong>{mode.label}</strong>
              <div>
                <button type="button" onClick={() => edit(mode)}>Editar</button>
                <button type="button" className="danger" onClick={() => remove(mode.id)}>Excluir</button>
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

        <h2>De fábrica <span>{builtin.length}</span></h2>
        <p className="modes-hint">Vivem no código (<code>server/server.mjs</code>, <code>FORMATS</code>). Servem de exemplo de brief bem escrito.</p>
        {builtin.map((mode) => (
          <article className="modes-card builtin" key={mode.id}>
            <div className="modes-card-head"><strong>{mode.label}</strong></div>
            <p>{mode.brief || <em>sem instrução — modo livre</em>}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
