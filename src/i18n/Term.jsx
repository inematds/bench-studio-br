import React from "react";
import { useI18n } from "./index.jsx";

/**
 * Jargao que fica em ingles de proposito.
 *
 * "prompt", "seed", "upscale" e companhia sao o vocabulario que a pessoa vai
 * encontrar em qualquer outra ferramenta, em qualquer tutorial e na conta do
 * provedor — traduzir isso deixaria a interface bonita e a pessoa perdida.
 * A saida foi manter o termo e pendurar a explicacao nele: o texto fica
 * sublinhado e diz o que e no idioma da interface, ao passar o mouse ou pelo
 * leitor de tela.
 *
 * Uso: <Termo id="seed" />  ou  <Termo id="seed">seed fixa</Termo>
 */
export default function Term({ id, children, className = "" }) {
  const { t } = useI18n();
  const label = children ?? t(`glossary.${id}.term`);
  const meaning = t(`glossary.${id}.meaning`);
  return (
    <abbr className={`term ${className}`.trim()} title={meaning} aria-label={`${label}: ${meaning}`}>
      {label}
    </abbr>
  );
}
