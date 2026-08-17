// project_engines.mjs — quem escreve os arquivos de uma build.
//
// O construtor de sites/documentos não é "uma chamada de LLM": é algo que
// PRODUZ ARQUIVOS numa pasta. Há duas famílias de motor, e a diferença importa:
//
//   AGENTES (codex, claude) escrevem os arquivos eles mesmos, iterando: olham o
//   que produziram, corrigem e continuam. Custam mais e dependem do sandbox do
//   próprio agente.
//
//   MODELOS (ollama local, openrouter) só devolvem TEXTO. Quem grava é este
//   arquivo. Não há sandbox envolvido — nada além deste processo toca o disco —
//   e por isso funcionam mesmo onde o bwrap está bloqueado pelo AppArmor.
//
// Todos entregam a mesma coisa: arquivos na pasta do projeto. O contrato do
// runner (stage/result.json) não muda.

import { spawn } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_FILE_BYTES = 400_000;

// ------------------------------------------------------------------ agentes

export async function runCodex({ prompt, outputDir, request, stage, eventsPath, isWebsite }) {
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex({
    config: { features: { apps: false, browser_use: false, computer_use: false, image_generation: false, multi_agent: false, plugins: false, skill_search: false } },
  });
  const thread = codex.startThread({
    workingDirectory: outputDir,
    model: request.model || "gpt-5.6-sol",
    modelReasoningEffort: request.reasoning || "low",
    sandboxMode: "workspace-write",
    networkAccessEnabled: false,
    skipGitRepoCheck: true,
    webSearchMode: "disabled",
    webSearchEnabled: false,
    approvalPolicy: "never",
  });

  const controller = new AbortController();
  let lastEvent = Date.now();
  const timeout = setTimeout(() => controller.abort(new Error("Project build exceeded 14 minutes")), 14 * 60_000);
  const watchdog = setInterval(() => {
    if (Date.now() - lastEvent > 6 * 60_000) controller.abort(new Error("Project build produced no progress for 6 minutes"));
  }, 15_000);
  watchdog.unref();

  try {
    stage(18, `Codex is designing the ${isWebsite ? "site" : "document"}`);
    const { events } = await thread.runStreamed(prompt, { signal: controller.signal });
    for await (const event of events) {
      lastEvent = Date.now();
      await appendFile(eventsPath, `${JSON.stringify(event)}\n`);
      if (event.type === "turn.started") stage(24, "Creative build started");
      if (event.type === "item.started" && event.item?.type === "command_execution") stage(48, "Building and inspecting files");
      if (event.type === "turn.failed") throw new Error(event.error?.message || "Codex build failed");
      if (event.type === "error") throw new Error(event.message || "Codex build failed");
    }
  } finally {
    clearTimeout(timeout);
    clearInterval(watchdog);
  }
}

// O Claude Code tem sistema de permissão próprio e NÃO depende do bwrap, então
// funciona nesta máquina mesmo com o AppArmor restringindo user namespaces.
// `--add-dir` não é passado de propósito: o diretório de trabalho já é a pasta
// da build, e ampliar o alcance seria o oposto do que se quer aqui.
export async function runClaude({ prompt, outputDir, request, stage, eventsPath, isWebsite }) {
  stage(18, `Claude Code is designing the ${isWebsite ? "site" : "document"}`);
  const args = ["-p", prompt, "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose"];
  if (request.model) args.push("--model", request.model);

  await new Promise((resolvePromise, reject) => {
    const child = spawn("claude", args, { cwd: outputDir, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let buffer = "";
    const timeout = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Claude Code build exceeded 14 minutes")); }, 14 * 60_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        appendFile(eventsPath, `${line}\n`).catch(() => {});
        try {
          const event = JSON.parse(line);
          if (event.type === "assistant") stage(48, "Writing and inspecting files");
        } catch { /* linha nao-JSON do CLI */ }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error.code === "ENOENT" ? new Error("CLI do Claude Code não encontrado no PATH.") : error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise();
      else reject(new Error(stderr.split("\n").filter(Boolean).at(-1) || `Claude Code saiu com status ${code}`));
    });
  });
}

// ------------------------------------------------------------------ modelos

// Um LLM puro não escreve em disco, então pedimos os arquivos como JSON e
// gravamos aqui. É por isso que este caminho não precisa de sandbox nenhum.
// MEDIDO: pedir os arquivos como JSON falha. O qwen local devolveu 18 mil
// caracteres e o parse morreu em
//   SyntaxError: Expected ',' or ']' after array element ... position 5731
// Não é falha do modelo: escapar milhares de caracteres de HTML — com aspas,
// barras e quebras de linha — dentro de uma string JSON, sem errar uma única
// vez, é frágil por construção. Delimitador de linha não tem esse problema:
// nada dentro do arquivo precisa ser escapado.
const FILE_MARK = "=== FILE:";

function fileContract(isWebsite) {
  const names = isWebsite ? "index.html, styles.css, app.js" : "document.html";
  return `

FORMATO DA RESPOSTA — obrigatório:
Escreva cada arquivo precedido por uma linha com o nome dele, exatamente assim:

${FILE_MARK} index.html ===
<!doctype html>
...conteúdo completo...

${FILE_MARK} styles.css ===
...conteúdo completo...

Arquivos obrigatórios: ${names}.
Não use cercas de código (\`\`\`). Não escape nada. Não comente. Escreva apenas as
linhas marcadoras e o conteúdo dos arquivos.`;
}

// Aceita o formato com marcadores e, se o modelo tiver insistido em JSON e
// acertado, aproveita também — não custa nada e evita rejeitar uma resposta boa.
function parseFiles(text) {
  const raw = String(text ?? "")
    // qwen3 e afins pensam em voz alta antes de responder.
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();

  const marker = /^[ \t]*=== *FILE: *(.+?) *===[ \t]*$/gim;
  const hits = [...raw.matchAll(marker)];
  if (hits.length) {
    return hits.map((hit, index) => {
      const start = hit.index + hit[0].length;
      const end = index + 1 < hits.length ? hits[index + 1].index : raw.length;
      return {
        path: hit[1].trim(),
        // Cercas de código escapam mesmo quando pedimos para não usar.
        content: raw.slice(start, end).replace(/^\s*```[a-z]*\n?|\n?```\s*$/g, "").trim() + "\n",
      };
    });
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed?.files)) return parsed.files;
    } catch { /* cai no erro abaixo */ }
  }
  throw new Error(`O modelo não devolveu arquivos no formato pedido (nenhuma linha "${FILE_MARK} nome ===" encontrada).`);
}

async function writeModelFiles(files, outputDir, isWebsite) {
  if (!Array.isArray(files) || !files.length) throw new Error("O modelo não devolveu nenhum arquivo.");
  const written = [];
  for (const file of files) {
    const name = String(file?.path ?? "").trim().replace(/^\.?\//, "");
    // Nome de arquivo vindo de um modelo é entrada não confiável como qualquer
    // outra: nada de subir de diretório nem de caminho absoluto.
    if (!name || name.includes("..") || name.includes("/") || name.startsWith(".")) continue;
    const content = String(file?.content ?? "");
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error(`${name} passou de ${MAX_FILE_BYTES} bytes.`);
    await writeFile(join(outputDir, name), content);
    written.push(name);
  }
  const required = isWebsite ? "index.html" : "document.html";
  if (!written.includes(required)) throw new Error(`O modelo não produziu ${required}. Gravou: ${written.join(", ") || "nada"}.`);

  // MEDIDO: uma build passou por "completa" com index.html + styles.css e SEM
  // app.js — que o proprio HTML referenciava. O CSS deixava 7 elementos em
  // opacity:0 esperando o JS revela-los, entao o site abria com o titulo e os
  // beneficios INVISIVEIS. Parecia fonte que nao carregou; era conteudo que
  // nunca aparecia. Um arquivo referenciado e ausente nao e detalhe: quebra a
  // pagina silenciosamente, que e o pior jeito de quebrar.
  const html = await readFile(join(outputDir, required), "utf8");
  const referenced = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"':#?]+)["']/gi)]
    .map((match) => match[1].trim().replace(/^\.\//, ""))
    .filter((ref) => ref && !/^(https?:|data:|mailto:|tel:|\/\/)/i.test(ref) && !ref.startsWith("/"));
  const missing = [...new Set(referenced)].filter((ref) => !written.includes(ref));
  if (missing.length) {
    throw new Error(
      `${required} referencia arquivo(s) que o modelo nao criou: ${missing.join(", ")}. ` +
      `A pagina abriria quebrada (o CSS costuma esconder elementos ate o JS revela-los). Gravados: ${written.join(", ")}.`,
    );
  }
  return written;
}

export async function runOllama({ prompt, outputDir, request, stage, eventsPath, isWebsite }) {
  const base = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const model = request.model || "qwen3.6:35b-a3b";
  stage(18, `${model} (local) está escrevendo o ${isWebsite ? "site" : "documento"}`);

  let response;
  try {
    response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.7, num_ctx: 16384 },
        messages: [{ role: "user", content: prompt + fileContract(isWebsite) }],
      }),
      signal: AbortSignal.timeout(14 * 60_000),
    });
  } catch (error) {
    throw new Error(`Ollama (${base}) não respondeu: ${error.message}. O serviço está no ar?`);
  }
  if (!response.ok) throw new Error(`Ollama devolveu HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const data = await response.json();
  const text = data?.message?.content ?? "";
  await appendFile(eventsPath, `${JSON.stringify({ type: "model.response", engine: "ollama", model, chars: text.length })}\n`);
  stage(70, "Gravando os arquivos");
  await writeModelFiles(parseFiles(text), outputDir, isWebsite);
}

export async function runOpenRouter({ prompt, outputDir, request, stage, eventsPath, isWebsite }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY ausente.");
  const model = request.model || process.env.OPENROUTER_MODEL_DEFAULT || "google/gemini-2.5-flash";
  stage(18, `${model} está escrevendo o ${isWebsite ? "site" : "documento"}`);

  const response = await fetch(`${process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      // Teto explícito: sem ele o OpenRouter reserva 65535 tokens e recusa a
      // conta com 402 quando o saldo é baixo (medido em 2026-08-16).
      max_tokens: 32000,
      messages: [{ role: "user", content: prompt + fileContract(isWebsite) }],
    }),
    signal: AbortSignal.timeout(14 * 60_000),
  });
  if (!response.ok) throw new Error(`OpenRouter devolveu HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  await appendFile(eventsPath, `${JSON.stringify({ type: "model.response", engine: "openrouter", model, chars: text.length })}\n`);
  stage(70, "Gravando os arquivos");
  await writeModelFiles(parseFiles(text), outputDir, isWebsite);
}

export const ENGINES = {
  codex: { run: runCodex, label: "Codex", kind: "agent", note: "Agente iterativo. Precisa do sandbox (bwrap) funcionando." },
  claude: { run: runClaude, label: "Claude Code", kind: "agent", note: "Agente iterativo com permissão própria — não depende do bwrap." },
  ollama: { run: runOllama, label: "Qwen local (ollama)", kind: "model", note: "Local, custo zero, sem sandbox. Uma passada, sem auto-correção." },
  openrouter: { run: runOpenRouter, label: "OpenRouter", kind: "model", note: "Remoto e pago. Uma passada, sem auto-correção." },
};

export default ENGINES;
