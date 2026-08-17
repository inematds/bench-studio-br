import React from "react";
import { LANGS, useI18n } from "./index.jsx";

/**
 * Seletor de idioma. Duas línguas cabem num botão que alterna — menu só
 * valeria a pena a partir da terceira.
 */
export default function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  const next = lang === "pt-BR" ? "en" : "pt-BR";

  return (
    <button
      type="button"
      className="ghost-btn lang-btn"
      onClick={() => setLang(next)}
      title={t("lang.switchTo", { lang: LANGS[next].label })}
      aria-label={t("lang.switchTo", { lang: LANGS[next].label })}
      data-testid="lang-switch"
      data-lang={lang}
    >
      {LANGS[lang].short}
    </button>
  );
}
