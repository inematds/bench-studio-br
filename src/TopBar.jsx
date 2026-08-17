import React from "react";
import { useI18n } from "./i18n/index.jsx";
import LangSwitch from "./i18n/LangSwitch.jsx";

export default function TopBar({ summary, activeView, onLedger, ledgerOpen, billing, onCredits, creditsOpen, version, onConfig, configOpen }) {
  const { t, lang } = useI18n();
  const month = summary?.month ?? 0;
  const all = summary?.all_time ?? 0;
  const gens = summary?.total_generations ?? 0;
  const navItem = (view, label, title) => (
    <a
      href={`#${view}`}
      className={activeView === view ? "active" : ""}
      aria-current={activeView === view ? "page" : undefined}
      title={title}
    >
      {label}
    </a>
  );

  return (
    <header className="top">
      <div className="brand">
        Bench
        <small>studio</small>
        {version && <span className="brand-version" title={`Bench Studio ${version}`}>v{version}</span>}
      </div>

      <nav className="top-nav" aria-label={t("topbar.nav")}>
        {navItem("create", t("topbar.create"), t("topbar.createTitle"))}
        {navItem("websites", t("topbar.websites"), t("topbar.websitesTitle"))}
        {navItem("documents", t("topbar.documents"), t("topbar.documentsTitle"))}
        {navItem("models", t("topbar.models"), t("topbar.modelsTitle"))}
        {navItem("work", t("topbar.work"), t("topbar.workTitle"))}
        {navItem("modes", t("topbar.modes"), t("topbar.modesTitle"))}
        {navItem("connect", t("topbar.connect"), t("topbar.connectTitle"))}
      </nav>

      <div className="top-spacer" />

      <div className="usage" title={t("topbar.usageTitle", { total: fmt(all) })}>
        <span>{t("topbar.usage")}</span>
        <strong>${fmt(month)}</strong>
        <span>{gens} {t("common.runs")}</span>
      </div>

      <button type="button" className={`credit-btn${creditsOpen ? " on" : ""}`} onClick={onCredits}>
        {billing?.available && billing.current_balance != null
          ? t("topbar.credits", { amount: currency(billing.current_balance, billing.currency, lang) })
          : t("topbar.addCredits")}
      </button>

      {/* Config fica no grupo da direita, com Usage e Ledger: e ferramenta de
          conta e de maquina, nao um workspace de trabalho como as abas. */}
      <button
        type="button"
        className={`ghost-btn${configOpen ? " on" : ""}`}
        onClick={onConfig}
        title={t("topbar.configTitle")}
      >
        {t("topbar.config")}
      </button>

      <button type="button" className={`ghost-btn${ledgerOpen ? " on" : ""}`} onClick={onLedger}>
        {t("topbar.ledger")}
      </button>

      <LangSwitch />
    </header>
  );
}

function currency(value, code = "USD", lang = undefined) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

function fmt(n) {
  const v = Number(n) || 0;
  return v < 1 ? v.toFixed(3) : v.toFixed(2);
}
