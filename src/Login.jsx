import React, { useState } from "react";
import { useT } from "./i18n/index.jsx";
import LangSwitch from "./i18n/LangSwitch.jsx";

// Shown only when a password is configured and this browser has no session.
// With no password set, this screen never appears.

export default function Login({ onDone }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      // O servidor manda `code` para o que a interface sabe traduzir e
      // `error` como frase crua — o fallback cobre o que for novo.
      if (!res.ok) throw new Error(body.code ? t(`server.${body.code}`) : (body.error || t("login.wrong")));
      onDone();
    } catch (e) {
      setError(String(e.message ?? e));
      setPassword("");
    } finally { setBusy(false); }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-top">
          <div className="brand">Bench<small>studio</small></div>
          <LangSwitch />
        </div>
        <h1>{t("login.locked")}</h1>
        <p>{t("login.enterPassword")}</p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("login.passwordPlaceholder")}
          autoFocus
          autoComplete="current-password"
          aria-label={t("login.passwordLabel")}
          disabled={busy}
        />
        {error && <p className="config-alert danger" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !password}>
          {busy ? t("login.checking") : t("login.enter")}
        </button>

        <p className="login-hint" dangerouslySetInnerHTML={{ __html: t("login.hint") }} />
      </form>
    </div>
  );
}
