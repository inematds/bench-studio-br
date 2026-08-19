import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
// Dicionario do desktop, importado como DADO (pt-BR.js e um objeto exportado,
// sem React dentro). Os subcontroles do modo chegam do servidor com chaves de
// traducao — sem isto a tela mostraria "prompt.shot.field.creator" no lugar de
// "Criador".
import ptBR from "../src/i18n/pt-BR.js";

function traduzir(key, alternativa) {
  if (!key) return alternativa;
  const valor = key.split(".").reduce((no, parte) => (no == null ? no : no[parte]), ptBR);
  return typeof valor === "string" ? valor : alternativa;
}

// Interface de celular. Duas telas e nada mais: CRIAR e GALERIA.
//
// Ela nao reimplementa o estudio — fala com a MESMA API em 8787, pelas mesmas
// rotas que o desktop usa (/api/models, /api/quote, /api/generate, /api/upload,
// /api/ledger). Nada em `src/` foi tocado para isto existir, e nenhuma rota
// nova foi criada no servidor: se o desktop funciona, isto funciona.
//
// O que ficou de fora, de proposito: catalogo de modelos, modos de captura,
// refino de prompt, projetos de site e PDF, configuracao. Tela de telefone e
// para escrever, tocar em gerar e olhar o resultado.

const api = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    let message = `${response.status}`;
    try { message = JSON.parse(text).error || message; } catch { if (text.trim()) message = text.trim(); }
    throw new Error(message);
  }
  return text.trim() ? JSON.parse(text) : null;
};

const money = (value) => `$${Number(value ?? 0).toFixed(3)}`;

// Quais parametros aparecem no telefone.
//
// Antes isto era uma lista fechada de nomes conhecidos, e foi um erro: a Agnes
// chama o campo de `size` (1312x736, 736x1312…), que nao estava na lista — entao
// o modelo dela aparecia SEM nenhuma opcao de tamanho, e nao havia como pedir
// vertical. Agora entra qualquer parametro que ofereca escolha; a lista abaixo
// so decide a ORDEM, para o que mais importa ficar em cima.
const PRIORIDADE = ["aspect_ratio", "size", "image_size", "resolution", "duration", "quality"];

const ROTULOS = {
  aspect_ratio: "Proporção",
  size: "Tamanho",
  image_size: "Tamanho",
  resolution: "Resolução",
  duration: "Duração",
  quality: "Qualidade",
  num_images: "Quantidade",
};

function rotuloParam(name) {
  return ROTULOS[name] ?? name.replace(/_/g, " ");
}

function paramOptions(model) {
  const params = model?.params ?? {};
  return Object.entries(params)
    .filter(([, spec]) => Array.isArray(spec?.enum) && spec.enum.length > 1)
    .sort(([a], [b]) => {
      const pa = PRIORIDADE.indexOf(a), pb = PRIORIDADE.indexOf(b);
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.localeCompare(b);
    })
    // Teto de 4: tela de telefone. O resto do schema continua existindo e usa o
    // padrao do modelo, que ja e uma escolha razoavel.
    .slice(0, 4)
    .map(([name, spec]) => ({ name, values: spec.enum, fallback: spec.default ?? spec.enum[0] }));
}

function acceptsImage(model) {
  const inputs = model?.capabilities?.inputs ?? [];
  return inputs.some((input) => input.modality === "image" || input.modality === "mixed");
}

// Modelo de EDICAO: o schema marca a entrada de imagem como obrigatoria. Sem
// referencia ele nao tem o que editar — e o pedido fica pendurado no provedor em
// vez de recusar, que foi o que aconteceu no primeiro teste desta tela.
function exigeImagem(model) {
  return (model?.capabilities?.inputs ?? []).some(
    (input) => (input.modality === "image" || input.modality === "mixed") && input.required,
  );
}

function primaryImageField(model) {
  const inputs = model?.capabilities?.inputs ?? [];
  const image = inputs.find((input) => input.modality === "image" || input.modality === "mixed");
  return image?.field ?? model?.capabilities?.primary_image_field ?? null;
}

// -------------------------------------------------------------------- criar

function Criar({ models, formats, recents, onDone }) {
  const [kind, setKind] = useState("image");
  const [format, setFormat] = useState("none");
  const [shotSettings, setShotSettings] = useState({});
  const [provedor, setProvedor] = useState("all");
  const [modelId, setModelId] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState({});
  const [ref, setRef] = useState(null);
  const [quote, setQuote] = useState(null);
  const [job, setJob] = useState(null);
  // Guarda o texto ORIGINAL ao refinar. Sem isso o refino seria irreversivel: a
  // pessoa perde o que escreveu e nao tem como voltar.
  const [original, setOriginal] = useState(null);
  const [refinando, setRefinando] = useState(false);
  const [erro, setErro] = useState(null);
  const fileRef = useRef(null);

  // Subcontroles do modo (Criador, Cenario, Beat, Camera…). Sao do MODO, nao do
  // modelo, entao vivem logo abaixo dele — e mudam junto quando o modo muda.
  const controles = useMemo(
    () => (formats.find((f) => f.id === format)?.controls ?? []).filter((c) => c.options?.length),
    [formats, format],
  );

  useEffect(() => {
    const padrao = {};
    for (const c of controles) padrao[c.id] = c.options[0].value;
    setShotSettings(padrao);
  }, [format, controles.length]);

  // Provedores existentes PARA O TIPO escolhido: oferecer um provedor que so tem
  // modelo de imagem quando a pessoa esta em video daria uma lista vazia.
  const provedores = useMemo(
    () => [...new Set(models.filter((m) => m.kind === kind).map((m) => m.provider ?? "fal"))].sort(),
    [models, kind],
  );

  const doTipo = useMemo(() => {
    const list = models.filter((m) => m.kind === kind && (provedor === "all" || (m.provider ?? "fal") === provedor));
    // Recentes primeiro: no celular, a escolha certa quase sempre e a de ontem.
    // Mas modelo que EXIGE imagem so vem na frente quando ja existe uma anexada;
    // caso contrario o padrao da tela seria um modelo impossivel de usar.
    const rank = (m) => {
      const i = recents.indexOf(m.id);
      return i === -1 ? 999 : i;
    };
    // No modo Reframe a imagem e o INSUMO — sem ela nao ha o que reenquadrar.
    // Entao ali os modelos de edicao sobem, em vez de descer: o contrario
    // deixava a tela abrir num modelo que nem aceita anexo.
    const esperaImagem = Boolean(ref) || format === "reframe";
    const grupo = (m) => {
      if (esperaImagem) return exigeImagem(m) || acceptsImage(m) ? 0 : 1;
      return exigeImagem(m) ? 1 : 0;
    };
    return [...list].sort((a, b) => grupo(a) - grupo(b) || rank(a) - rank(b) || a.label.localeCompare(b.label));
  }, [models, kind, provedor, recents, Boolean(ref), format]);

  const model = doTipo.find((m) => m.id === modelId) ?? doTipo[0] ?? null;

  useEffect(() => { setProvedor("all"); }, [kind]);
  useEffect(() => { setModelId(doTipo[0]?.id ?? null); }, [kind, provedor, format, models.length]);

  // Parametros zeram ao trocar de modelo: enum de um nao vale para o outro, e
  // mandar valor invalido faz o provedor recusar com uma mensagem obscura.
  useEffect(() => {
    if (!model) return;
    const next = {};
    for (const option of paramOptions(model)) next[option.name] = option.fallback;
    setParams(next);
    setRef((current) => (current && acceptsImage(model) ? current : null));
  }, [model?.id]);

  useEffect(() => {
    if (!model) return undefined;
    let dead = false;
    api("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: model.id, params }),
    }).then((q) => { if (!dead) setQuote(q); }).catch(() => setQuote(null));
    return () => { dead = true; };
  }, [model?.id, JSON.stringify(params)]);

  async function anexar(file) {
    if (!file) return;
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api("/api/upload", { method: "POST", body: fd });
      setRef({ ...up, url: up.remote_url ?? up.url, preview: URL.createObjectURL(file) });
    } catch (e) { setErro(`Falha no anexo: ${e.message}`); }
  }

  async function gerar() {
    // No Reframe o texto e opcional: o brief do modo ja descreve a operacao, e o
    // que a pessoa escreve compete com ele. A imagem anexada e o pedido.
    const soReenquadra = format === "reframe" && Boolean(ref);
    if ((!prompt.trim() && !soReenquadra) || !model) return;
    if (format === "reframe" && !ref) {
      setErro("O modo Mudar proporção reenquadra uma imagem existente: anexe a imagem antes de gerar.");
      return;
    }
    if (exigeImagem(model) && !ref) {
      setErro(`${model.label} edita uma imagem: anexe uma referência (galeria ou câmera) antes de gerar.`);
      return;
    }
    setErro(null);
    setJob({ phase: "submitting" });
    try {
      const field = ref ? primaryImageField(model) : null;
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          prompt: prompt.trim() || "reenquadrar",
          rawIdea: prompt.trim(),
          format,
          params,
          shotSettings,
          inputAssets: ref && field
            ? [{ url: ref.url, field, media_type: ref.media_type, upload_id: ref.upload_id, name: ref.name }]
            : [],
        }),
      });
      if (!response.ok) {
        const texto = await response.text();
        let mensagem = `Falhou (${response.status})`;
        try { mensagem = JSON.parse(texto).error || mensagem; } catch {}
        throw new Error(mensagem);
      }

      // A resposta e um fluxo NDJSON que termina em `done` ou `error`. Se ela
      // acabar sem nenhum dos dois, a conexao caiu no meio — e silencio e o
      // pior desfecho: a pessoa nao sabe se espera, se repete, se ja pagou.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminou = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const evento = JSON.parse(linha);
          if (evento.phase === "error") { terminou = true; setErro(evento.error); setJob(null); }
          else if (evento.phase === "done") { terminou = true; setJob(null); onDone(evento.ledger); }
          else setJob((atual) => ({ ...atual, ...evento }));
        }
      }
      if (!terminou) {
        setJob(null);
        setErro("A conexao caiu antes de terminar. O provedor pode ter concluido mesmo assim — confira na galeria antes de gerar de novo, para nao pagar duas vezes.");
      }
    } catch (e) {
      setJob(null);
      setErro(String(e.message ?? e));
    }
  }

  async function refinar() {
    if (!prompt.trim() || !model || refinando) return;
    setErro(null);
    setRefinando(true);
    try {
      const resultado = await api("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: prompt.trim(),
          modelId: model.id,
          format,
          params,
          shotSettings,
          hasReference: Boolean(ref),
          refCount: ref ? 1 : 0,
        }),
      });
      if (resultado?.prompt) {
        setOriginal(prompt);
        setPrompt(resultado.prompt);
      }
    } catch (e) { setErro(`Refino falhou: ${e.message}`); }
    finally { setRefinando(false); }
  }

  const opcoes = model ? paramOptions(model) : [];
  const podeAnexar = model ? acceptsImage(model) : false;

  return (
    <div className="tela">
      <label className="campo">
        <span>Modo</span>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>

      {/* Reframe tem botao proprio, e nao so uma linha na lista: ele resolve um
          problema recorrente — "tenho em 16:9 e preciso em 9:16" — e dentro de
          um seletor com nove opcoes ele simplesmente nao era encontrado. Um
          toque liga, outro volta para o modo livre. */}
      {formats.some((f) => f.id === "reframe") && (
        <button
          type="button"
          className={`reframe-atalho${format === "reframe" ? " on" : ""}`}
          onClick={() => setFormat(format === "reframe" ? "none" : "reframe")}
        >
          <b>⇅</b>
          <span>
            {format === "reframe" ? "Mudando a proporção" : "Mudar proporção da imagem"}
            <i>16:9 ⇄ 9:16 sem cortar — estende a cena</i>
          </span>
        </button>
      )}

      {controles.map((controle) => (
        <label className="campo sub" key={controle.id}>
          <span>{traduzir(controle.key, controle.label ?? controle.id)}</span>
          <select
            value={shotSettings[controle.id] ?? controle.options[0].value}
            onChange={(e) => setShotSettings((atual) => ({ ...atual, [controle.id]: e.target.value }))}
          >
            {controle.options.map((o) => (
              <option key={String(o.value)} value={o.value}>{traduzir(o.key, o.label ?? o.value)}</option>
            ))}
          </select>
        </label>
      ))}

      <div className="seg" role="tablist">
        {["image", "video"].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k}
            className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
            {k === "image" ? "Imagem" : "Vídeo"}
          </button>
        ))}
      </div>

      <label className="campo">
        <span>Provedor</span>
        <select value={provedor} onChange={(e) => setProvedor(e.target.value)}>
          <option value="all">Todos ({models.filter((m) => m.kind === kind).length})</option>
          {provedores.map((p) => (
            <option key={p} value={p}>
              {p} ({models.filter((m) => m.kind === kind && (m.provider ?? "fal") === p).length})
            </option>
          ))}
        </select>
      </label>

      <label className="campo">
        <span>Modelo</span>
        <select value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)}>
          {doTipo.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}{exigeImagem(m) ? " (precisa de imagem)" : ""}{recents.includes(m.id) ? " ·" : ""}
            </option>
          ))}
        </select>
      </label>

      <textarea
        className="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Descreva o que você quer criar…"
        rows={5}
      />

      <div className="refino">
        <button type="button" className="refinar" onClick={refinar} disabled={!prompt.trim() || refinando || Boolean(job)}>
          {refinando ? "Refinando…" : "Refinar prompt"}
        </button>
        {original !== null && (
          <button type="button" className="desfazer" onClick={() => { setPrompt(original); setOriginal(null); }}>
            desfazer
          </button>
        )}
      </div>

      {opcoes.map((option) => (
        <label className="campo" key={option.name}>
          <span>{rotuloParam(option.name)}</span>
          <select
            value={params[option.name] ?? option.fallback}
            onChange={(e) => setParams((p) => ({ ...p, [option.name]: e.target.value }))}
          >
            {option.values.map((value) => <option key={String(value)} value={value}>{String(value)}</option>)}
          </select>
        </label>
      ))}

      {podeAnexar && (
        <div className="anexo">
          {ref ? (
            <div className="anexo-tem">
              <img src={ref.preview ?? ref.local_url} alt="referência" />
              <button type="button" onClick={() => setRef(null)}>remover</button>
            </div>
          ) : (
            <div className="anexo-botoes">
              {/* `capture` abre a camera direto; sem ele o telefone oferece a
                  galeria e a foto na hora vira tres toques a mais. */}
              <button type="button" onClick={() => fileRef.current?.click()}>Galeria</button>
              <button type="button" onClick={() => { fileRef.current.setAttribute("capture", "environment"); fileRef.current.click(); }}>Câmera</button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { anexar(e.target.files?.[0]); e.target.value = ""; fileRef.current?.removeAttribute("capture"); }}
          />
        </div>
      )}

      {erro && <div className="erro" role="alert">{erro}</div>}

      <div className="rodape-acao">
        <div className="preco">
          {quote?.total != null ? <><b>{money(quote.total)}</b> <span>estimado</span></>
            : quote?.basis ? <span>{quote.basis}</span>
            : <span>preço indisponível</span>}
        </div>
        <button type="button" className="gerar" disabled={(!prompt.trim() && !(format === "reframe" && ref)) || !model || Boolean(job)} onClick={gerar}>
          {job ? (job.phase === "submitting" ? "Enviando…" : "Gerando…") : "Gerar"}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ galeria

const PAGINA = 30;

function Galeria({ rows, onReload }) {
  const [limite, setLimite] = useState(PAGINA);
  const [tipo, setTipo] = useState("all");
  const [provedor, setProvedor] = useState("all");
  const [modelo, setModelo] = useState("all");
  const [zoom, setZoom] = useState(null);

  const comSaida = useMemo(() => rows.filter((r) => r.outputs?.length), [rows]);
  const opcoesDe = (campo) => [...new Set(comSaida.map(campo).filter(Boolean))].sort();

  const filtrados = useMemo(() => comSaida.filter((r) =>
    (tipo === "all" || r.kind === tipo)
    && (provedor === "all" || (r.provider ?? "fal") === provedor)
    && (modelo === "all" || r.model === modelo)
  ), [comSaida, tipo, provedor, modelo]);

  useEffect(() => { setLimite(PAGINA); }, [tipo, provedor, modelo]);

  const visiveis = filtrados.slice(0, limite);

  return (
    <div className="tela">
      <div className="filtros">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="all">Tudo</option>
          <option value="image">Imagens</option>
          <option value="video">Vídeos</option>
        </select>
        <select value={provedor} onChange={(e) => setProvedor(e.target.value)}>
          <option value="all">Provedor</option>
          {opcoesDe((r) => r.provider ?? "fal").map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
          <option value="all">Modelo</option>
          {opcoesDe((r) => r.model).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="button" className="recarregar" onClick={onReload} aria-label="Recarregar">↻</button>
      </div>

      <div className="contagem">{filtrados.length} resultado(s)</div>

      <div className="grade">
        {visiveis.map((r, i) => {
          const saida = r.outputs[0];
          const src = saida.local_url || saida.url;
          const video = String(saida.content_type ?? "").startsWith("video") || /\.mp4($|\?)/.test(src);
          return (
            <button type="button" className="cartao" key={`${r.archive_id ?? r.request_id}-${i}`}
              onClick={() => setZoom({ src, video, label: r.label, prompt: r.raw_idea || r.prompt })}>
              {/* Vídeo NAO vira <video> aqui. Trinta players carregando metadados
                  ao mesmo tempo travaram ate o navegador do desktop no teste —
                  num celular seria pior, e ainda gastaria o plano de dados da
                  pessoa para exibir miniaturas. O arquivo so e buscado quando
                  ela toca para ver. */}
              {video
                ? <span className="cartao-video"><b>▶</b><i>{r.label}</i></span>
                : <img src={src} alt={r.label} loading="lazy" />}
              <span className="cartao-tag">{video ? "vídeo" : "imagem"} · {money(r.cost)}</span>
            </button>
          );
        })}
      </div>

      {limite < filtrados.length && (
        <button type="button" className="mais" onClick={() => setLimite((n) => n + PAGINA)}>
          Carregar mais ({filtrados.length - limite} restantes)
        </button>
      )}

      {zoom && (
        <div className="cheia" onClick={() => setZoom(null)}>
          <button type="button" className="cheia-fechar" aria-label="Fechar">×</button>
          {zoom.video
            ? <video src={zoom.src} controls autoPlay loop playsInline />
            : <img src={zoom.src} alt={zoom.label} />}
          <div className="cheia-legenda">
            <b>{zoom.label}</b>
            {zoom.prompt && <p>{zoom.prompt}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------- app

function App() {
  const [aba, setAba] = useState("criar");
  const [models, setModels] = useState([]);
  const [formats, setFormats] = useState([{ id: "none", label: "Livre" }]);
  const [rows, setRows] = useState([]);
  const [erro, setErro] = useState(null);
  const [precisaSenha, setPrecisaSenha] = useState(false);
  const [senha, setSenha] = useState("");

  const carregarLedger = useCallback(() => {
    api("/api/ledger").then((l) => setRows(l?.rows ?? [])).catch(() => {});
  }, []);

  const carregar = useCallback(() => {
    api("/api/models")
      .then((c) => {
        setModels((c?.models ?? []).filter((m) => m.kind === "image" || m.kind === "video"));
        if (c?.formats?.length) setFormats(c.formats);
      })
      .catch((e) => setErro(String(e.message ?? e)));
    carregarLedger();
  }, [carregarLedger]);

  useEffect(() => {
    // O estudio pode estar trancado por senha (BENCH_PASSWORD). Sem perguntar
    // isto primeiro, toda chamada voltaria 401 e a tela ficaria vazia sem dizer
    // por que.
    api("/api/auth")
      .then((a) => {
        if (a?.required && !a?.authenticated) setPrecisaSenha(true);
        else carregar();
      })
      .catch(() => carregar());
  }, [carregar]);

  // Modelos usados por ultimo, tirados do proprio historico: e o que faz a
  // lista de modelos caber num telefone sem virar catalogo.
  const recents = useMemo(() => {
    const vistos = [];
    for (const row of rows) {
      if (row.model && !vistos.includes(row.model)) vistos.push(row.model);
      if (vistos.length >= 8) break;
    }
    return vistos;
  }, [rows]);

  if (precisaSenha) {
    return (
      <div className="login">
        <h1>Bench</h1>
        <p>Este estúdio está trancado.</p>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha" />
        <button type="button" onClick={async () => {
          try {
            await api("/api/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password: senha }),
            });
            setPrecisaSenha(false);
            carregar();
          } catch (e) { setErro(String(e.message ?? e)); }
        }}>Entrar</button>
        {erro && <div className="erro">{erro}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <strong>Bench</strong>
        <span>celular</span>
      </header>

      <main>
        {aba === "criar"
          ? <Criar models={models} formats={formats} recents={recents} onDone={(ledger) => { setRows((p) => [ledger, ...p]); setAba("galeria"); carregarLedger(); }} />
          : <Galeria rows={rows} onReload={carregarLedger} />}
      </main>

      <nav className="abas">
        <button type="button" className={aba === "criar" ? "on" : ""} onClick={() => setAba("criar")}>Criar</button>
        <button type="button" className={aba === "galeria" ? "on" : ""} onClick={() => setAba("galeria")}>Galeria</button>
      </nav>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

// Service worker so em producao: em desenvolvimento ele guardaria o modulo
// antigo e faria o Vite parecer quebrado.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const base = import.meta.env.BASE_URL || "/";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  });
}
