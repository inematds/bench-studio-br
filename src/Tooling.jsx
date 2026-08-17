import React, { useEffect, useMemo, useState } from "react";
import { useT } from "./i18n/index.jsx";
import Term from "./i18n/Term.jsx";

const TOOL_NAMES = [
  "list_models",
  "get_model_capabilities",
  "upload_media",
  "create_media",
  "list_results",
  "get_usage",
  "sync_models",
  "create_website",
  "create_document",
  "list_projects",
  "get_project",
];

export default function Tooling() {
  const t = useT();
  const [config, setConfig] = useState(null);
  const [copied, setCopied] = useState(false);
  const [client, setClient] = useState("claude");

  useEffect(() => {
    fetch("/api/tooling").then((response) => response.json()).then(setConfig).catch(() => {});
  }, []);

  const snippet = useMemo(() => {
    if (!config) return t("connect.loadingConfig");
    if (client === "codex") {
      return [
        "[mcp_servers.bench-studio]",
        `command = ${JSON.stringify(config.command)}`,
        `args = ${JSON.stringify(config.args)}`,
        "",
        "[mcp_servers.bench-studio.env]",
        `BENCH_URL = ${JSON.stringify(config.environment.BENCH_URL)}`,
      ].join("\n");
    }
    return JSON.stringify({
      mcpServers: {
        "bench-studio": {
          command: config.command,
          args: config.args,
          env: config.environment,
        },
      },
    }, null, 2);
  }, [client, config, t]);

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  const clientLabel = client === "codex" ? "Codex" : client === "cursor" ? "Cursor" : "Claude Desktop";

  return (
    <section className="connect-page">
      <div className="connect-hero">
        <div>
          <div className="eyebrow">{t("connect.eyebrow")}</div>
          <h1>{t("connect.title")}</h1>
          <p>{t("connect.subtitle")}</p>
        </div>
        <span className="local-pill"><i /> {t("connect.localPill")}</span>
      </div>

      <div className="connect-grid">
        <article className="connect-card connect-skill">
          <div className="connect-card-head">
            <div><span>01</span><h2>{t("connect.step1.title")}</h2></div>
            <a className="connect-primary-action" href={config?.skill?.download_url ?? "/api/tooling/skill"} download>
              {t("connect.step1.download")}
            </a>
          </div>
          <p>{t("connect.step1.body")}</p>
          <div className="skill-package">
            <div className="skill-package-mark" aria-hidden="true"><i /><i /><i /></div>
            <div><strong>{t("connect.step1.packageName")}</strong><span>{t("connect.step1.packageNote")}</span></div>
            <small>v{config?.skill?.version ?? "0.2.0"}</small>
          </div>
          <p className="install-path">
            {t("connect.step1.unzipInto")}{" "}
            <code>{client === "codex" ? (config?.skill?.installs?.codex ?? "~/.codex/skills/bench-studio") : (config?.skill?.installs?.claude_code ?? "~/.claude/skills/bench-studio")}</code>
          </p>
        </article>

        <article className="connect-card connect-config">
          <div className="connect-card-head">
            <div><span>02</span><h2>{t("connect.step2.title")}</h2></div>
            <button type="button" onClick={copy}>{copied ? t("common.copied") : t("connect.step2.copyConfig")}</button>
          </div>
          <p>{t("connect.step2.body")}</p>
          <div className="client-switch" role="tablist" aria-label={t("connect.step2.clientLabel")}>
            <button type="button" role="tab" aria-selected={client === "claude"} className={client === "claude" ? "active" : ""} onClick={() => setClient("claude")}>Claude Desktop</button>
            <button type="button" role="tab" aria-selected={client === "codex"} className={client === "codex" ? "active" : ""} onClick={() => setClient("codex")}>Codex</button>
            <button type="button" role="tab" aria-selected={client === "cursor"} className={client === "cursor" ? "active" : ""} onClick={() => setClient("cursor")}>Cursor</button>
          </div>
          <pre tabIndex="0" aria-label={t("connect.step2.snippetLabel", { client: clientLabel })}><code>{snippet}</code></pre>
        </article>

        <article className="connect-card">
          <div className="connect-card-head"><div><span>03</span><h2>{t("connect.step3.title")}</h2></div></div>
          <p className="example-prompt">{t("connect.step3.example")}</p>
          <div className="connect-note">{t("connect.step3.note")}</div>
        </article>
      </div>

      <section className="tool-list-section">
        <div className="tool-list-head">
          <div>
            <h2>{t("connect.tools.title")}</h2>
            <p>{t("connect.tools.subtitle", { count: TOOL_NAMES.length })}</p>
          </div>
          <span>{t("connect.tools.count", { count: config?.tools?.length ?? TOOL_NAMES.length })}</span>
        </div>
        <div className="tool-list">
          {TOOL_NAMES.map((name) => (
            <article key={name}><code>{name}</code><p>{t(`connect.tools.${name}`)}</p></article>
          ))}
        </div>
      </section>

      <p className="connect-foot">
        <Term id="mcp" /> — {t("connect.mcpFoot")}
      </p>
    </section>
  );
}
