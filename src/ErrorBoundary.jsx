import React from "react";
import { useT } from "./i18n/index.jsx";

/**
 * Sem isto, uma excecao em QUALQUER canto da interface desmonta a arvore
 * inteira e sobra uma pagina preta, sem mensagem — foi exatamente o que um
 * `creditIds` nao declarado no catalogo fez com o estudio todo.
 *
 * Com um limite por workspace, o estrago fica do tamanho do defeito: a aba
 * quebrada vira um cartao com o erro, e o resto continua utilizavel.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // O console continua sendo a fonte da pilha completa; o cartao mostra so o
    // suficiente para a pessoa saber o que quebrou e reportar.
    console.error(`[bench] ${this.props.name ?? "workspace"} failed to render`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      // Classe nao usa hook; o cartao e um filho funcional so para poder
      // traduzir pelo contexto de idioma.
      <ErrorCard
        name={this.props.name}
        error={this.state.error}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

function ErrorCard({ name, error, onRetry }) {
  const t = useT();
  return (
    <section className="view-page error-card" role="alert">
      <h2>{t("error.title", { name: name ?? t("error.fallbackName") })}</h2>
      <p>{t("error.body")}</p>
      <pre>{String(error?.message ?? error)}</pre>
      <button type="button" onClick={onRetry}>{t("common.retry")}</button>
    </section>
  );
}
