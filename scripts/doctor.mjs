// `npm run doctor` — confere os requisitos ANTES de instalar, atualizar ou
// culpar a rede.
//
// Existe porque as duas falhas que mais custaram tempo numa VPS nova nao diziam
// o que estava errado: Node 20 (o servidor morre no import de node:sqlite e so
// o Vite sobe, entao todo /api/ da ECONNREFUSED e parece firewall) e um
// `git pull` travado por dois arquivos que a propria maquina regrava.
//
// Cada checagem responde tres coisas: o que se esperava, o que se achou, e o
// comando que resolve. Nada aqui escreve nada nem imprime valor de chave —
// somente presenca.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, accessSync, constants } from "node:fs";
import { createServer } from "node:net";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const NODE_MIN = { major: 22, minor: 5 };
const results = [];
const record = (level, name, detail, fix = null) => results.push({ level, name, detail, fix });
const ok = (name, detail) => record("ok", name, detail);
const warn = (name, detail, fix) => record("warn", name, detail, fix);
const fail = (name, detail, fix) => record("fail", name, detail, fix);

// Sem trim() aqui de proposito: no `git status --porcelain` a coluna de status
// ocupa os dois primeiros caracteres e o caminho comeca no terceiro. Aparar a
// saida inteira comia o espaco inicial da PRIMEIRA linha e devolvia
// "ackage.json" no lugar de "package.json". Quem precisa apara o que leu.
const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const shLine = (cmd, args) => sh(cmd, args)?.trim() ?? null;

// --------------------------------------------------------------- requisitos

const [major, minor] = process.versions.node.split(".").map(Number);
if (major > NODE_MIN.major || (major === NODE_MIN.major && minor >= NODE_MIN.minor)) {
  ok("Node", `${process.versions.node} (mínimo ${NODE_MIN.major}.${NODE_MIN.minor})`);
} else {
  fail(
    "Node",
    `${process.versions.node} — o banco usa node:sqlite, que só existe a partir do ${NODE_MIN.major}.${NODE_MIN.minor}`,
    "curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash - && sudo apt install -y nodejs && rm -rf node_modules && npm install"
  );
}

const npmVersion = shLine("npm", ["-v"]);
npmVersion ? ok("npm", npmVersion) : fail("npm", "não encontrado no PATH", "instale o Node pelo comando acima — o npm vem junto");

const gitVersion = shLine("git", ["--version"]);
gitVersion ? ok("git", gitVersion.replace("git version ", "")) : warn("git", "não encontrado", "apt install -y git — sem ele não há `npm run update`");

// ------------------------------------------------------------- instalacao

if (existsSync(join(ROOT, "node_modules"))) {
  const stamp = existsSync(join(ROOT, "node_modules", ".package-lock.json"));
  ok("Dependências", stamp ? "node_modules instalado" : "node_modules existe (sem marca do npm — reinstale se algo falhar)");
} else {
  fail("Dependências", "node_modules ausente — o clone não traz", "npm install");
}

const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  // Chave declarada mas vazia e pior que chave ausente: o codigo antigo mandava
  // "Key " no header e o provedor respondia 401 de FORMATO, que parece
  // credencial invalida e manda voce procurar no lugar errado.
  const empty = env.split("\n").filter((line) => /^[A-Z0-9_]+=\s*$/.test(line.trim())).map((line) => line.split("=")[0].trim());
  if (empty.length) {
    warn("Arquivo .env", `presente, mas com chave declarada vazia: ${empty.join(", ")}`, "apague a linha inteira em vez de deixar o valor em branco");
  } else {
    ok("Arquivo .env", "presente");
  }
} else {
  warn("Arquivo .env", "ausente — dá para configurar tudo pela tela de Config depois", "cp .env.example .env");
}

// ------------------------------------------------------------------ dados

try {
  accessSync(ROOT, constants.W_OK);
  ok("Escrita no projeto", "o processo pode gravar em data/");
} catch {
  fail("Escrita no projeto", "sem permissão de escrita na pasta", "confira o dono: chown -R $USER .");
}

// ---------------------------------------------------------------- sandbox

// Aviso, nao FALHA: sem bwrap o estudio sobe e constroi normalmente pelos
// motores `claude` e `ollama` — quem para e so o `codex`. E a falha nao se
// parece com sandbox nenhum: a build morre dizendo que "o ambiente recusou
// todas as gravacoes no diretorio do projeto", com o disco gravavel o tempo
// todo. Sem esta linha, o motivo real nunca aparece.
const bwrap = shLine("bash", ["-c", "command -v bwrap"]);
if (!bwrap) {
  warn("Sandbox (motor codex)", "bwrap não instalado — o motor codex não constrói", "apt install -y bubblewrap && sudo ./scripts/fix-sandbox.sh");
} else if (sh("bash", ["-c", `${bwrap} --dev-bind / / --unshare-net true`]) !== null) {
  ok("Sandbox (motor codex)", "bwrap funcional");
} else {
  // `systemd-detect-virt` sai com 1 justamente no caso mais comum (maquina
  // fisica ou KVM: imprime "none"), e o sh() engole tudo que sai nao-zero.
  const virt = shLine("bash", ["-c", "systemd-detect-virt || true"]) || "desconhecido";
  warn(
    "Sandbox (motor codex)",
    `bwrap bloqueado (virt=${virt}) — builds do codex falham dizendo que não conseguiram gravar; claude e ollama seguem funcionando`,
    "sudo ./scripts/fix-sandbox.sh"
  );
}

// ------------------------------------------------------------------ portas

const portState = (port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (e) => resolve(e.code === "EADDRINUSE" ? "ocupada" : "erro"));
    probe.once("listening", () => probe.close(() => resolve("livre")));
    probe.listen(port, "127.0.0.1");
  });

for (const [port, artigo, quem] of [[8787, "o", "servidor"], [5200, "a", "interface"]]) {
  const state = await portState(port);
  if (state === "livre") ok(`Porta ${port}`, `livre (${quem})`);
  else if (state === "ocupada") warn(`Porta ${port}`, `ocupada — ${artigo} ${quem} já está no ar, ou sobrou processo antigo`, `ss -tlnp | grep ${port}`);
  else warn(`Porta ${port}`, "não deu para testar", null);
}

// -------------------------------------------------------------- versionado

if (gitVersion && existsSync(join(ROOT, ".git"))) {
  const head = shLine("git", ["log", "--oneline", "-1"]);
  const sujos = (sh("git", ["status", "--porcelain"]) ?? "")
    .split("\n").map((line) => line.slice(3).trim()).filter(Boolean);
  // Estes dois a maquina reescreve sozinha: o servidor regrava o generated_at do
  // catalogo a cada boot, e o npm install mexe no lock. Nao sao trabalho humano.
  const churn = new Set(["package-lock.json", "server/providers/kie.models.json"]);
  const meus = sujos.filter((f) => !churn.has(f));
  ok("Repositório", head ?? "sem histórico legível");
  if (meus.length) warn("Alterações locais", `${meus.length} arquivo(s) modificados: ${meus.slice(0, 5).join(", ")}`, "commite ou guarde antes de atualizar: git stash");
  else if (sujos.length) ok("Alterações locais", "só os arquivos que a máquina regrava — o update resolve sozinho");
  else ok("Alterações locais", "nenhuma");
} else if (gitVersion) {
  warn("Repositório", "esta pasta não é um clone git", "atualização manual — `npm run update` não funciona aqui");
}

// -------------------------------------------------------------- relatorio

const icon = { ok: "  ok  ", warn: " aviso", fail: " FALHA" };
process.stdout.write(`\n  Bench Studio ${pkg.version} — requisitos\n\n`);
for (const r of results) {
  process.stdout.write(`  [${icon[r.level]}] ${r.name}: ${r.detail}\n`);
  if (r.fix && r.level !== "ok") process.stdout.write(`            → ${r.fix}\n`);
}

const falhas = results.filter((r) => r.level === "fail").length;
const avisos = results.filter((r) => r.level === "warn").length;
process.stdout.write(
  falhas
    ? `\n  ${falhas} item(ns) impedem o estúdio de subir. Resolva os marcados como FALHA.\n\n`
    : `\n  Requisitos atendidos${avisos ? `, com ${avisos} aviso(s)` : ""}.\n\n`
);
process.exit(falhas ? 1 : 0);
