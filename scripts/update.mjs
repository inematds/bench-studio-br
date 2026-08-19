// `npm run update` — atualiza a instalacao sem os tropecos conhecidos.
//
// O `git pull` cru falha em maquina que ja rodou o estudio, porque dois arquivos
// sao reescritos por ela mesma: `server/providers/kie.models.json` (o servidor
// regrava o generated_at a cada boot) e `package-lock.json` (o npm install).
// Nenhum dos dois carrega trabalho humano, entao aqui eles sao descartados —
// mas SO eles: qualquer outra alteracao local interrompe o update e pede uma
// decisao sua, em vez de ser atropelada.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHURN = ["package-lock.json", "server/providers/kie.models.json"];

const say = (msg) => process.stdout.write(`  ${msg}\n`);
const die = (msg, fix) => {
  process.stderr.write(`\n  ${msg}\n${fix ? `  → ${fix}\n` : ""}\n`);
  process.exit(1);
};
// `raw` existe por causa do `git status --porcelain`: a coluna de status ocupa os
// dois primeiros caracteres e o caminho comeca no terceiro. Aparar a saida
// inteira comia o espaco inicial da PRIMEIRA linha, devolvia "erver/providers/..."
// e — pior — fazia o arquivo deixar de casar com a lista de churn, entao o update
// parava pedindo decisao sobre um arquivo que ele mesmo deveria descartar.
const gitRaw = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) die(`git ${args[0]} falhou:\n  ${(r.stderr || r.stdout || "").trim()}`);
  return r.stdout ?? "";
};
const git = (...args) => gitRaw(...args).trim();
const run = (cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) die(`${cmd} ${args.join(" ")} falhou.`);
};

const version = () => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

process.stdout.write("\n");
if (!existsSync(join(ROOT, ".git"))) die("Esta pasta não é um clone git.", "atualize copiando os arquivos, ou clone o repositório");

const antes = version();
say(`versão atual: ${antes}`);

// 1. so os arquivos de churn podem ser descartados; o resto e decisao sua.
const sujos = gitRaw("status", "--porcelain").split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
const meus = sujos.filter((f) => !CHURN.includes(f));
if (meus.length) {
  die(
    `você tem alterações locais que o update não vai atropelar:\n  ${meus.join("\n  ")}`,
    "guarde com `git stash` (recupera com `git stash pop`) ou commite, e rode de novo"
  );
}
const descartar = sujos.filter((f) => CHURN.includes(f));
if (descartar.length) {
  say(`descartando o que a máquina regrava sozinha: ${descartar.join(", ")}`);
  git("checkout", "--", ...descartar);
}

// 2. so avanco linear. Merge automatico numa VPS e receita de surpresa.
say("buscando atualizações…");
git("fetch", "--quiet", "origin");
const local = git("rev-parse", "HEAD");
const remoto = git("rev-parse", "@{u}");
if (local === remoto) {
  say(`já está atualizado (${antes}).`);
  process.stdout.write("\n");
  process.exit(0);
}
git("merge", "--ff-only", "@{u}");
say(`atualizado: ${git("log", "--oneline", "-1")}`);

// 3. dependencias e build so quando o que as define mudou.
const mudou = git("diff", "--name-only", `${local}..HEAD`).split("\n").filter(Boolean);
const semDependencias = !existsSync(join(ROOT, "node_modules"));
if (semDependencias || mudou.some((f) => f === "package.json" || f === "package-lock.json")) {
  say(semDependencias ? "node_modules ausente — instalando…" : "dependências mudaram — reinstalando…");
  run("npm", ["install"]);
} else {
  say("dependências inalteradas.");
}

// Em producao quem responde e o dist/, nao o Vite: sem reconstruir, o navegador
// continua recebendo o pacote antigo e a atualizacao parece nao ter acontecido.
// So reconstroi se ja existe um dist/ — quem roda em modo dev nao precisa.
if (existsSync(join(ROOT, "dist", "index.html"))) {
  say("dist/ encontrado — reconstruindo a interface…");
  run("npm", ["run", "build"]);
}

// O celular tem build propria e base propria (/m/ atras do nginx). Reconstruir
// so o desktop deixaria o telefone servindo o pacote antigo — e ainda por cima
// com o service worker ajudando a esconder isso.
if (existsSync(join(ROOT, "dist-mobile", "index.html"))) {
  say("dist-mobile/ encontrado — reconstruindo a interface de celular…");
  run("npm", ["run", "build:mobile"], { BENCH_MOBILE_BASE: process.env.BENCH_MOBILE_BASE ?? "/m/" });
}

say("conferindo os requisitos…");
run("node", ["scripts/doctor.mjs"]);

// 4. reiniciar E parte de atualizar. Codigo novo no disco com o processo antigo
//    na memoria e o jeito mais facil de concluir que "a correcao nao funcionou".
const depois = version();
const servico = process.env.BENCH_SERVICE ?? "bench-studio";
const semReinicio = process.argv.includes("--no-restart");

function servicoAtivo() {
  const r = spawnSync("systemctl", ["is-active", "--quiet", servico], { stdio: "ignore" });
  return r.status === 0;
}

if (semReinicio) {
  say("--no-restart: o processo antigo continua no ar.");
} else if (servicoAtivo()) {
  say(`reiniciando o serviço ${servico}…`);
  const sudo = process.getuid?.() === 0 ? [] : ["sudo"];
  run(sudo.length ? "sudo" : "systemctl", sudo.length ? ["systemctl", "restart", servico] : ["restart", servico]);
} else if (existsSync(join(ROOT, "stop.sh")) && existsSync(join(ROOT, "start.sh"))) {
  // Sem systemd: derruba o que estiver deste projeto e sobe de novo do mesmo
  // jeito documentado. O stop nao reclama quando nao ha nada rodando.
  say("reiniciando (start.sh/stop.sh)…");
  spawnSync("./stop.sh", [], { cwd: ROOT, stdio: "inherit" });
  const subiu = spawnSync("./start.sh", [], { cwd: ROOT, stdio: "inherit" });
  if (subiu.status !== 0) die("o estúdio não voltou. Veja o log indicado acima.");
} else {
  say("nada rodando por aqui — suba quando quiser: ./start.sh");
}

process.stdout.write(
  `\n  ${antes} → ${depois}.\n` +
  `  Confira:  curl -s localhost:${process.env.PORT ?? 8787}/api/health\n\n`
);
