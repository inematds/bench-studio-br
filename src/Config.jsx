import React, { useCallback, useEffect, useState } from "react";
import { useT } from "./i18n/index.jsx";

// What the studio needs in order to work, and where each piece came from.
//
// This screen never receives a secret. The server sends presence, origin and a
// four-character tail; the values themselves stay on disk, behind the operating
// system's permissions. An input left untouched sends nothing.

export default function Config({ onClose }) {
  const t = useT();
  // O servidor descreve os campos em ingles (e o contrato que o MCP e a skill
  // tambem consomem). A interface prefere a traducao quando existe e cai no
  // texto do servidor quando o campo e novo — assim um provider adicionado
  // amanha aparece legivel, so que em ingles, em vez de sumir.
  const tr = (key, fallback) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const [state, setState] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [tests, setTests] = useState({});
  const passwordSet = !!state?.fields?.find((f) => f.key === "BENCH_PASSWORD")?.present;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(t("config.readFailed", { status: res.status }));
      setState(await res.json());
    } catch (e) { setError(String(e.message ?? e)); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    // An empty box for a secret means "keep what is there", never "delete it" —
    // the box starts empty by design (we never receive the value), so treating
    // empty as a delete would wipe a key on a stray keystroke. Clearing a secret
    // is done in the .env file itself, where the intent is unambiguous.
    const secret = new Set((state?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
    const patch = Object.fromEntries(
      Object.entries(drafts).filter(([k, v]) => v !== undefined && !(secret.has(k) && v.trim() === "")),
    );
    if (!Object.keys(patch).length) { setNotice(t("config.nothingChanged")); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || t("config.saveFailed", { status: res.status }));
      setState(body);
      setDrafts({});
      setNotice(t("config.savedNotice"));
    } catch (e) { setError(String(e.message ?? e)); }
    finally { setBusy(false); }
  }

  async function testProvider(id) {
    setTests((prev) => ({ ...prev, [id]: { testing: true } }));
    try {
      const res = await fetch(`/api/config/test/${id}`, { method: "POST" });
      const body = await res.json();
      setTests((prev) => ({ ...prev, [id]: body }));
    } catch (e) {
      setTests((prev) => ({ ...prev, [id]: { available: false, reason: String(e.message ?? e) } }));
    }
  }

  if (!state && !error) return <aside className="sheet"><div className="sheet-body"><p>{t("config.loading")}</p></div></aside>;

  const readOnly = state && !state.writable;

  return (
    <aside className="sheet config-sheet">
      <div className="sheet-head">
        <div className="sheet-title">
          <h3>{t("config.title")}</h3>
          <span>{t("config.subtitle")}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="ghost-btn" onClick={onClose}>{t("common.close")}</button>
      </div>

      <div className="sheet-body">
        {error && <p className="config-alert danger" role="alert">{error}</p>}
        {notice && <p className="config-alert" role="status">{notice}</p>}

        {/* Publicado COM senha e uma escolha; publicado SEM senha e porta
            aberta. Dizer "sem autenticacao" a quem definiu senha ensina a
            pessoa a ignorar o aviso — e ai ele nao serve para nada. */}
        {state?.lan_exposed && !passwordSet && (
          <p className="config-alert danger" role="alert">
            <strong>{t("config.lanTitle")}</strong>{" "}
            {t("config.lanBody")}
          </p>
        )}
        {state?.lan_exposed && passwordSet && (
          <p className="config-alert" role="status">
            <strong>{t("config.lanWithPasswordTitle")}</strong>{" "}
            {t("config.lanWithPasswordBody")}
          </p>
        )}

        {readOnly && (
          <p className="config-alert danger" role="alert">
            <strong>{t("config.readOnlyTitle")}</strong> {t("config.readOnlyBody")}
          </p>
        )}

        <p className="config-note" dangerouslySetInnerHTML={{ __html: t("config.readingOrder", { path: state?.project_env_path ?? "" }) }} />

        <PasswordCard state={state} readOnly={readOnly} onChanged={load} />

        {state?.groups.map((group) => {
          const fields = state.fields.filter((f) => f.group === group.id);
          if (!fields.length) return null;
          return (
            <section key={group.id} className="config-group">
              <h4>{tr(`config.groups.${group.id}.label`, group.label)}</h4>
              <p className="config-note">{tr(`config.groups.${group.id}.note`, group.note)}</p>

              {fields.filter((f) => f.key !== "BENCH_PASSWORD").map((field) => (
                <ConfigField
                  key={field.key}
                  field={field}
                  effect={tr(`config.fields.${field.key}`, field.effect)}
                  draft={drafts[field.key]}
                  readOnly={readOnly}
                  onDraft={(v) => setDrafts((d) => ({ ...d, [field.key]: v }))}
                  test={tests[providerOf(field.key)]}
                  onTest={providerOf(field.key) ? () => testProvider(providerOf(field.key)) : null}
                  live={state.providers?.[providerOf(field.key)]}
                />
              ))}
            </section>
          );
        })}

        <div className="config-actions">
          <button type="button" onClick={save} disabled={busy || readOnly}>
            {busy ? t("common.saving") : t("config.saveToEnv")}
          </button>
          <button type="button" className="ghost-btn" onClick={() => { setDrafts({}); setNotice(null); setError(null); }} disabled={busy}>
            {t("config.discard")}
          </button>
        </div>
      </div>
    </aside>
  );
}

// The password is not an env var like the others: you type a password and what
// gets stored is a hash of it, so it has its own action and its own endpoint.
function PasswordCard({ state, readOnly, onChanged }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const active = state?.fields?.find((f) => f.key === "BENCH_PASSWORD")?.present;

  async function send(password) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/config/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || t("config.genericFailed", { status: res.status }));
      setValue("");
      setMsg(body.code ? t(`server.${body.code}`) : body.message);
      onChanged();
    } catch (e) { setErr(String(e.message ?? e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="config-group">
      <h4>{t("config.access.title")}</h4>
      <p className="config-note">{t("config.access.note")}</p>

      <div className={`config-field ${active ? "set" : "missing"}`}>
        <div className="config-field-head">
          <strong>{t("config.access.fieldLabel")}</strong>
          <code>BENCH_PASSWORD</code>
          <span className="spacer" />
          <span className={`config-badge ${active ? "on" : "off"}`}>{active ? t("config.access.isSet") : t("config.access.notSet")}</span>
        </div>
        <p className="config-note">{t("config.access.hashNote")}</p>

        {msg && <p className="config-alert" role="status">{msg}</p>}
        {err && <p className="config-alert danger" role="alert">{err}</p>}

        <div className="config-field-edit">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={active ? t("config.access.replacePlaceholder") : t("config.access.newPlaceholder")}
            disabled={readOnly || busy}
            autoComplete="new-password"
            aria-label={t("login.passwordLabel")}
          />
          <button type="button" className="ghost-btn small" onClick={() => send(value)} disabled={readOnly || busy || value.length < 4}>
            {active ? t("config.access.replace") : t("config.access.set")}
          </button>
          {active && (
            <button type="button" className="ghost-btn small" onClick={() => send("")} disabled={readOnly || busy}>
              {t("config.access.remove")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// Which provider a key belongs to, for the "Test" button. A key with no
// provider (a path, a port) has nothing to ping.
function providerOf(key) {
  if (key === "FAL_KEY") return "fal";
  if (key === "AGNES_API_KEY") return "agnes";
  if (key === "KIE_API_KEY") return "kie";
  if (key === "INEMAIMG_URL") return "inemaimg";
  return null;
}

// Um endereco em valor padrao continua testavel: e justamente ali que "esta no
// ar?" e a pergunta que importa, porque ninguem digitou nada.
function ConfigField({ field, effect, draft, readOnly, onDraft, onTest, test, live }) {
  const t = useT();
  const changed = draft !== undefined;
  const estado = field.present ? (field.shadowed ? "shadowed" : "set") : "missing";
  const sourceLabel = t(`config.sources.${field.source}`);

  return (
    <div className={`config-field ${estado}`}>
      <div className="config-field-head">
        <strong>{field.label}</strong>
        <code>{field.key}</code>
        <span className="spacer" />
        {field.present ? (
          <span className="config-badge on">
            {t("config.setBadge")}{field.masked_tail ? ` ${field.masked_tail}` : ""} · {sourceLabel === `config.sources.${field.source}` ? field.source : sourceLabel}
          </span>
        ) : field.using_fallback ? (
          <span className="config-badge">{t("config.usingDefault", { value: field.fallback })}</span>
        ) : (
          <span className="config-badge off">{t("config.notSet")}</span>
        )}
        {onTest && (
          <button type="button" className="ghost-btn small" onClick={onTest} disabled={!field.present && !field.using_fallback}>
            {test?.testing ? t("config.testing") : t("config.test")}
          </button>
        )}
      </div>

      <p className="config-note">{effect}</p>

      {field.shadowed && (
        <p className="config-alert danger" dangerouslySetInnerHTML={{ __html: t("config.shadowed") }} />
      )}

      {(test && !test.testing) && (
        <p className={`config-alert${test.available ? "" : " danger"}`}>
          {test.available ? t("config.testOk") : t("config.testFailed", { reason: test.reason ?? t("config.noAnswer") })}
        </p>
      )}
      {!test && live && live.available === false && (
        <p className="config-alert danger">{t("config.unavailableNow", { reason: live.reason })}{live.hint ? ` — ${live.hint}` : ""}</p>
      )}

      <div className="config-field-edit">
        <input
          type={field.secret ? "password" : "text"}
          value={changed ? draft : (field.secret ? "" : (field.value ?? ""))}
          placeholder={field.secret ? (field.present ? t("config.keepKeyPlaceholder") : t("config.pasteKeyPlaceholder")) : t("config.notSet")}
          onChange={(e) => onDraft(e.target.value)}
          disabled={readOnly}
          autoComplete="off"
          spellCheck={false}
          aria-label={field.label}
        />
        {field.help && <a href={field.help} target="_blank" rel="noreferrer">{t("config.whereToGet")}</a>}
        {changed && <span className="config-badge on">{t("config.willBeSaved")}</span>}
      </div>
    </div>
  );
}
