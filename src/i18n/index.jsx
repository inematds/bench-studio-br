import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ptBR from "./pt-BR.js";
import en from "./en.js";

/**
 * Camada de idioma do estudio.
 *
 * O app nasceu em ingles e virou bilingue sem que nenhuma string voltasse a
 * ser escrita dentro do JSX: cada texto virou uma chave, e as duas traducoes
 * moram em `pt-BR.js` e `en.js`. Isso mantem o merge com o upstream limpo —
 * quando o `promptadvisers/bench-studio-public` mexe num componente, o
 * conflito e no codigo, nunca em cada frase da interface.
 *
 * Ordem de resolucao do idioma (a primeira que responder vence):
 *   1. `?lang=pt-BR` na URL   — e assim que a suite Playwright fixa o idioma,
 *                               senao o teste passaria ou quebraria conforme
 *                               o locale da maquina que roda.
 *   2. localStorage           — a escolha da pessoa no seletor do TopBar.
 *   3. navigator.language     — visitante de fora cai em ingles sozinho.
 *   4. pt-BR                  — o padrao desta versao.
 */

export const LANGS = {
  "pt-BR": { label: "Português", short: "PT" },
  en: { label: "English", short: "EN" },
};

export const DEFAULT_LANG = "pt-BR";

const DICTS = { "pt-BR": ptBR, en };
const STORAGE_KEY = "bench.lang";

function normalize(tag) {
  if (!tag) return null;
  const lower = String(tag).toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("en")) return "en";
  return null;
}

export function detectLang() {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const fromUrl = normalize(new URLSearchParams(window.location.search).get("lang"));
    if (fromUrl) return fromUrl;
  } catch {}
  try {
    const stored = normalize(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {}
  // Sem escolha registrada: quem chega com navegador em portugues fica em
  // portugues, o resto do mundo cai em ingles. O padrao final e pt-BR.
  const fromNav = normalize(typeof navigator !== "undefined" ? navigator.language : null);
  return fromNav ?? DEFAULT_LANG;
}

/** Resolve "a.b.c" dentro do dicionario. */
function lookup(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Troca {nome} pelos valores passados. Valor ausente some da frase. */
function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

export function translate(lang, key, vars) {
  const hit = lookup(DICTS[lang] ?? DICTS[DEFAULT_LANG], key)
    // Chave que ainda nao foi traduzida cai no ingles antes de virar defeito
    // visivel; so aparece crua se nao existir em lugar nenhum.
    //
    // O ingles e o UNICO fallback, de proposito: cair no portugues deixaria
    // frases soltas em pt no meio da interface em ingles. Quando a chave nao
    // existe nem la, quem chamou recebe a chave de volta e decide — e assim
    // que o Config prefere a descricao que o servidor mandou.
    ?? lookup(DICTS.en, key);
  if (hit == null) {
    if (typeof console !== "undefined" && import.meta?.env?.DEV) {
      console.warn(`[i18n] chave sem traducao: ${key}`);
    }
    return key;
  }
  return interpolate(hit, vars);
}

const LangContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    const norm = normalize(next) ?? DEFAULT_LANG;
    setLangState(norm);
    try {
      window.localStorage.setItem(STORAGE_KEY, norm);
    } catch {}
  }, []);

  const value = useMemo(() => {
    const t = (key, vars) => translate(lang, key, vars);
    return { lang, setLang, t };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** `const { t, lang, setLang } = useI18n()` */
export function useI18n() {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  // Componente montado fora do provider (teste unitario, storybook) ainda
  // traduz — so nao troca de idioma.
  const lang = DEFAULT_LANG;
  return { lang, setLang: () => {}, t: (key, vars) => translate(lang, key, vars) };
}

/** Atalho para quem so precisa do `t`. */
export function useT() {
  return useI18n().t;
}
