import React from "react";
import { useI18n } from "./i18n/index.jsx";

// Every generation this machine has ever made, and what it cost. This is the
// artifact you can put on screen and let someone read.

export default function Ledger({ ledger, onClose }) {
  const { t, lang } = useI18n();
  const { rows, summary } = ledger;
  const runs = summary?.total_generations ?? rows.length;
  const allTime = summary?.all_time ?? rows.reduce((total, row) => total + Number(row.cost ?? 0), 0);
  const average = runs ? allTime / runs : 0;

  return (
    <aside className="sheet">
      <div className="sheet-head">
        <div className="sheet-title">
          <h3>{t("ledger.title")}</h3>
          <span>{t("ledger.subtitle")}</span>
        </div>
        <span className="spacer" />
        <button type="button" className="ghost-btn" onClick={onClose}>{t("common.close")}</button>
      </div>

      <div className="sheet-body">
        <div className="ledger-summary" aria-label={t("ledger.summaryLabel")}>
          <div><span>{t("ledger.allTime")}</span><strong>${allTime.toFixed(3)}</strong></div>
          <div><span>{t("ledger.completedRuns")}</span><strong>{runs}</strong></div>
          <div><span>{t("ledger.averagePerRun")}</span><strong>${average.toFixed(3)}</strong></div>
        </div>
        {!rows.length ? (
          <p className="ledger-empty">
            {t("ledger.emptyTitle")}
            <br />
            {t("ledger.emptyBody")}
          </p>
        ) : (
          <div className="ledger-list">
            {rows.map((r, i) => {
              const verified = r.cost_confidence === "verified";
              return (
                <article className="ledger-row" key={`${r.request_id}-${i}`}>
                  <div className="ledger-row-head">
                    <div>
                      <strong>{r.label}</strong>
                      {/* A data segue o idioma escolhido, nao o do sistema:
                          senao o estudio em portugues mostraria "Sep 3". */}
                      <span>{new Date(r.ts).toLocaleString(lang, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}</span>
                    </div>
                    <div className="ledger-cost">
                      <strong>${Number(r.cost ?? 0).toFixed(3)}</strong>
                      <span className={verified ? "verified" : "estimated"}>
                        {verified ? t("ledger.billed") : t("ledger.estimated")}
                      </span>
                    </div>
                  </div>
                  <p>{String(r.raw_idea || r.prompt)}</p>
                  {r.request_id && <code>{r.request_id}</code>}
                </article>
              );
            })}
          </div>
        )}
        <p className="ledger-foot">{t("ledger.foot")}</p>
      </div>
    </aside>
  );
}
