// auth.mjs — senha opcional para o estúdio.
//
// Sem `BENCH_PASSWORD` definida, NADA muda: o estúdio abre direto, como sempre
// abriu. A senha é uma tranca que você escolhe pôr, não um pedágio que o
// programa cobra. Esse é o comportamento de fábrica, de propósito — quem usa na
// própria máquina não deveria digitar senha para falar com o próprio computador.
//
// Com a senha definida, ela protege a API: modelos, resultados, mídia, ledger e
// configuração. A casca da interface continua sendo servida (é HTML público e
// igual para todos), mas sem sessão ela não recebe dado nenhum. Trancar também a
// casca é trabalho de proxy reverso, não deste processo.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ESQUEMA = "scrypt";
const SESSION_COOKIE = "bench_session";
const SESSION_MS = 12 * 60 * 60 * 1000; // 12h

// Parâmetros do scrypt. N=2^15 leva ~100ms nesta classe de máquina: caro o
// suficiente para estragar a vida de quem tenta força bruta, barato o
// suficiente para um login não parecer travado.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
// O scrypt precisa de 128*N*r bytes; com N=2^15 isso da 32 MB, exatamente o teto
// padrao do Node — que entao recusa. Declarar o dobro e o que faz esses
// parametros serem utilizaveis.
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(plain) {
  const senha = String(plain ?? "");
  if (senha.length < 4) throw new Error("Password must be at least 4 characters.");
  const salt = randomBytes(16);
  const chave = scryptSync(senha, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return [ESQUEMA, N, salt.toString("hex"), chave.toString("hex")].join("$");
}

/**
 * Comparação em tempo constante. Comparar hash com `===` vaza, pelo tempo de
 * resposta, quantos caracteres iniciais bateram — é o suficiente para descobrir
 * o valor byte a byte.
 */
export function verifyPassword(plain, stored) {
  const partes = String(stored ?? "").split("$");
  if (partes.length !== 4 || partes[0] !== ESQUEMA) return false;
  const [, n, saltHex, esperadoHex] = partes;
  try {
    const esperado = Buffer.from(esperadoHex, "hex");
    const obtido = scryptSync(String(plain ?? ""), Buffer.from(saltHex, "hex"), esperado.length, { N: Number(n), r: R, p: P, maxmem: MAXMEM });
    return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
  } catch {
    return false;
  }
}

// O que vai para o disco é o SHA-256 do token, nunca o token. O cookie tem 256
// bits de aleatório, então não há dicionário a percorrer: quem lê o arquivo tem
// a impressão digital de uma sessão, não a sessão. Vale a mesma lógica do hash
// de senha — o arquivo é backupeado, copiado e lido por engano.
const digerir = (token) => createHash("sha256").update(String(token)).digest("hex");

/**
 * Sessões em memória E em disco, quando `store` é dado.
 *
 * Em memória basta no notebook de uma pessoa: quem reinicia o estúdio é você, e
 * relogar é trivial. Numa VPS a conta é outra — `./atualizar.sh` reinicia o
 * serviço sozinho, e a sessão morria NO MEIO de uma geração. A tela mostrava
 * "Something stopped this run / Authentication required.", que se parece com
 * erro do provedor de imagem e manda procurar o problema no lugar errado.
 *
 * Sem `store`, nada é gravado e o comportamento é o de sempre.
 */
export function createAuth({ hash = process.env.BENCH_PASSWORD ?? "", store = null, sessionMs = SESSION_MS } = {}) {
  let senhaHash = String(hash ?? "").trim();
  const sessoes = new Map();

  // Impressão digital da senha vigente. Sem isto, trocar a senha com o servidor
  // PARADO (`npm run set-password`, o caminho normal numa VPS) devolveria as
  // sessões antigas na volta — e trocar a senha deixaria de expulsar alguém,
  // que é a única coisa que trocar a senha precisa fazer.
  const marca = () => (senhaHash ? digerir(senhaHash).slice(0, 32) : "");

  function carregar() {
    if (!store) return;
    let bruto;
    try {
      bruto = JSON.parse(readFileSync(store, "utf8"));
    } catch {
      // Arquivo ausente, truncado por queda de energia ou editado à mão não pode
      // impedir o estúdio de subir: sem sessão só se reloga, com o servidor
      // morto não se faz nada.
      return;
    }
    if (!bruto || bruto.v !== 1 || bruto.pwd !== marca()) return;
    const agora = Date.now();
    for (const [digest, expira] of Object.entries(bruto.sessions ?? {})) {
      if (typeof expira === "number" && expira > agora) sessoes.set(digest, expira);
    }
  }

  function gravar() {
    if (!store) return;
    try {
      if (!sessoes.size) {
        rmSync(store, { force: true });
        return;
      }
      mkdirSync(dirname(store), { recursive: true });
      const corpo = JSON.stringify({ v: 1, pwd: marca(), sessions: Object.fromEntries(sessoes) });
      // Grava e renomeia: um kill no meio do write deixaria um JSON pela metade,
      // e aí o restart seguinte perderia TODAS as sessões — exatamente o que
      // isto existe para evitar. O modo 0600 vale para o temporário também,
      // senão há uma janela em que o arquivo nasce legível por todos.
      const temp = `${store}.tmp`;
      writeFileSync(temp, corpo, { mode: 0o600 });
      renameSync(temp, store);
    } catch {
      // Disco cheio ou pasta somente-leitura não derrubam o login: a sessão vale
      // nesta memória, e o preço é o de antes — cai no restart.
    }
  }
  // Atraso progressivo por origem. Não bloqueia ninguém para sempre (o dono
  // erraria a senha e ficaria de fora da própria máquina); só torna a tentativa
  // automática lenta demais para valer a pena.
  const erros = new Map();

  const required = () => senhaHash !== "";

  function limpar() {
    const agora = Date.now();
    let caiu = false;
    for (const [digest, expira] of sessoes) if (expira <= agora) { sessoes.delete(digest); caiu = true; }
    // So grava quando algo realmente expirou: `limpar()` roda a cada requisicao,
    // e reescrever o arquivo a cada uma seria I/O por nada.
    if (caiu) gravar();
  }

  function tokenDoPedido(req) {
    const cru = req?.headers?.cookie;
    if (!cru) return null;
    for (const parte of String(cru).split(";")) {
      const i = parte.indexOf("=");
      if (i === -1) continue;
      if (parte.slice(0, i).trim() === SESSION_COOKIE) return decodeURIComponent(parte.slice(i + 1).trim());
    }
    return null;
  }

  function authenticated(req) {
    if (!required()) return true;
    limpar();
    const token = tokenDoPedido(req);
    if (!token) return false;
    const expira = sessoes.get(digerir(token));
    return Boolean(expira && expira > Date.now());
  }

  function abrirSessao(res) {
    const token = randomBytes(32).toString("hex");
    sessoes.set(digerir(token), Date.now() + sessionMs);
    gravar();
    // httpOnly: um XSS não consegue ler o cookie e levar a sessão embora.
    // SameSite=Lax: outro site não consegue usar a sua sessão por tabela.
    // Sem `Secure`: o estúdio roda em http na sua rede, e um cookie Secure
    // simplesmente não seria enviado — a senha pararia de funcionar.
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionMs / 1000)}`);
    return token;
  }

  function fecharSessao(req, res) {
    const token = tokenDoPedido(req);
    if (token && sessoes.delete(digerir(token))) gravar();
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  }

  function atrasoDe(chave) {
    const falhas = erros.get(chave) ?? 0;
    return Math.min(falhas * 250, 4000);
  }

  async function login(req, res, senha) {
    if (!required()) return { ok: true, required: false };
    const origem = req?.socket?.remoteAddress ?? "?";
    const espera = atrasoDe(origem);
    if (espera) await new Promise((r) => setTimeout(r, espera));

    if (!verifyPassword(senha, senhaHash)) {
      erros.set(origem, (erros.get(origem) ?? 0) + 1);
      return { ok: false, code: "wrongPassword", error: "Wrong password." };
    }
    erros.delete(origem);
    abrirSessao(res);
    return { ok: true, required: true };
  }

  // Trocar a senha em memória evita exigir restart para a tranca passar a valer
  // — que é o caso em que esperar pelo restart seria pior: a janela entre
  // "defini a senha" e "ela vale" é justamente quando o estúdio está exposto.
  // As sessões abertas caem junto: mudar a senha tem de expulsar quem entrou com
  // a antiga, senão trocar a senha não protege de nada.
  function setHash(novo) {
    senhaHash = String(novo ?? "").trim();
    sessoes.clear();
    gravar();
  }

  carregar();

  return { required, authenticated, login, logout: fecharSessao, setHash, SESSION_COOKIE };
}
