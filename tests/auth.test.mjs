import test from "node:test";
import assert from "node:assert/strict";
import { createAuth, hashPassword, verifyPassword } from "../server/auth.mjs";

// Um `res` de mentira, só para ver o cookie que sai.
function fakeRes() {
  const headers = {};
  return { setHeader: (k, v) => { headers[k] = v; }, headers };
}
const comCookie = (valor) => ({ headers: { cookie: valor }, socket: { remoteAddress: "127.0.0.1" } });
const semCookie = () => ({ headers: {}, socket: { remoteAddress: "127.0.0.1" } });

function cookieDe(res) {
  return String(res.headers["Set-Cookie"] ?? "").split(";")[0];
}

test("no password configured: the studio stays open, as it always was", () => {
  const auth = createAuth({ hash: "" });
  assert.equal(auth.required(), false);
  assert.equal(auth.authenticated(semCookie()), true, "an unauthenticated request must pass when no password exists");
});

test("the stored hash never contains the password itself", () => {
  const stored = hashPassword("segredo-do-nei");
  assert.ok(!stored.includes("segredo-do-nei"));
  assert.match(stored, /^scrypt\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  // Sal aleatorio: a mesma senha nunca produz o mesmo hash duas vezes.
  assert.notEqual(hashPassword("segredo-do-nei"), stored);
});

test("verify accepts the right password and refuses everything else", () => {
  const stored = hashPassword("abc123");
  assert.equal(verifyPassword("abc123", stored), true);
  assert.equal(verifyPassword("abc124", stored), false);
  assert.equal(verifyPassword("", stored), false);
  assert.equal(verifyPassword("abc123", "lixo"), false);
  assert.equal(verifyPassword("abc123", ""), false);
});

test("a password too short is refused at the source", () => {
  assert.throws(() => hashPassword("abc"), /at least 4/);
});

test("with a password set, a request without a session is refused", () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  assert.equal(auth.required(), true);
  assert.equal(auth.authenticated(semCookie()), false);
  assert.equal(auth.authenticated(comCookie("bench_session=inventado")), false, "a made-up token must not pass");
});

test("the right password opens a session, and that session passes", async () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  const res = fakeRes();
  const r = await auth.login(semCookie(), res, "abc123");

  assert.equal(r.ok, true);
  const cookie = res.headers["Set-Cookie"];
  assert.match(cookie, /HttpOnly/, "the cookie must be unreadable by JavaScript");
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(auth.authenticated(comCookie(cookieDe(res))), true);
});

test("the wrong password opens nothing", async () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  const res = fakeRes();
  const r = await auth.login(semCookie(), res, "errada");
  assert.equal(r.ok, false);
  assert.equal(res.headers["Set-Cookie"], undefined, "a failed attempt must not set a cookie");
});

test("repeated failures get progressively slower", async () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  await auth.login(semCookie(), fakeRes(), "x");
  await auth.login(semCookie(), fakeRes(), "x");
  await auth.login(semCookie(), fakeRes(), "x");
  const inicio = Date.now();
  await auth.login(semCookie(), fakeRes(), "x");
  assert.ok(Date.now() - inicio >= 250, "the fourth attempt must be delayed");
});

test("logging out kills the session", async () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  const res = fakeRes();
  await auth.login(semCookie(), res, "abc123");
  const req = comCookie(cookieDe(res));
  assert.equal(auth.authenticated(req), true);

  auth.logout(req, fakeRes());
  assert.equal(auth.authenticated(req), false);
});

test("changing the password evicts whoever was already inside", async () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  const res = fakeRes();
  await auth.login(semCookie(), res, "abc123");
  const req = comCookie(cookieDe(res));
  assert.equal(auth.authenticated(req), true);

  auth.setHash(hashPassword("outra-senha"));
  assert.equal(auth.authenticated(req), false, "an old session must not survive a password change");
});

test("removing the password reopens the studio without a restart", () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  assert.equal(auth.authenticated(semCookie()), false);
  auth.setHash("");
  assert.equal(auth.required(), false);
  assert.equal(auth.authenticated(semCookie()), true);
});

// ------------------------------------------------- sessao que sobrevive ao restart
//
// A VPS atualiza sozinha, e todo `./atualizar.sh` reinicia o servico. Com as
// sessoes so em memoria, isso expulsava quem estava trabalhando NO MEIO de uma
// geracao — e a tela mostrava "Something stopped this run / Authentication
// required.", que parece erro do provedor de imagem e nao e.

import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const comLoja = () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-auth-"));
  return { store: join(dir, "sessions.json"), limpar: () => rmSync(dir, { recursive: true, force: true }) };
};

test("a session survives a restart when there is a store on disk", async () => {
  const { store, limpar } = comLoja();
  const hash = hashPassword("abc123");
  try {
    const antes = createAuth({ hash, store });
    const res = fakeRes();
    await antes.login(semCookie(), res, "abc123");
    const req = comCookie(cookieDe(res));
    assert.equal(antes.authenticated(req), true);

    // O restart: outro processo, mesma senha, mesmo arquivo.
    const depois = createAuth({ hash, store });
    assert.equal(depois.authenticated(req), true, "a sessão aberta antes do restart tem de continuar valendo");
  } finally {
    limpar();
  }
});

test("the store never holds the session token itself", async () => {
  const { store, limpar } = comLoja();
  try {
    const auth = createAuth({ hash: hashPassword("abc123"), store });
    const res = fakeRes();
    await auth.login(semCookie(), res, "abc123");
    const token = cookieDe(res).split("=")[1];

    const cru = readFileSync(store, "utf8");
    assert.ok(token.length > 32);
    assert.ok(!cru.includes(token), "quem ler o arquivo não pode sair usando a sessão");
    // Arquivo de sessão é credencial: 0600, como chave privada.
    assert.equal(statSync(store).mode & 0o777, 0o600);
  } finally {
    limpar();
  }
});

test("logging out and changing the password also clear the store", async () => {
  const { store, limpar } = comLoja();
  const hash = hashPassword("abc123");
  try {
    const auth = createAuth({ hash, store });
    const res = fakeRes();
    await auth.login(semCookie(), res, "abc123");
    const req = comCookie(cookieDe(res));

    auth.logout(req, fakeRes());
    assert.equal(createAuth({ hash, store }).authenticated(req), false, "logout tem de valer depois do restart também");

    const res2 = fakeRes();
    await auth.login(semCookie(), res2, "abc123");
    const req2 = comCookie(cookieDe(res2));
    auth.setHash(hashPassword("outra-senha"));
    assert.equal(createAuth({ hash: hashPassword("outra-senha"), store }).authenticated(req2), false);
  } finally {
    limpar();
  }
});

test("a session does not survive the password changing while the studio was down", async () => {
  const { store, limpar } = comLoja();
  try {
    const auth = createAuth({ hash: hashPassword("abc123"), store });
    const res = fakeRes();
    await auth.login(semCookie(), res, "abc123");
    const req = comCookie(cookieDe(res));

    // `npm run set-password` grava no .env com o servidor parado: na volta, a
    // sessao antiga nao pode valer — senao trocar a senha nao expulsaria ninguem.
    const depois = createAuth({ hash: hashPassword("senha-nova"), store });
    assert.equal(depois.authenticated(req), false);
  } finally {
    limpar();
  }
});

test("an expired session is not resurrected by the store", async () => {
  const { store, limpar } = comLoja();
  const hash = hashPassword("abc123");
  try {
    const auth = createAuth({ hash, store, sessionMs: 20 });
    const res = fakeRes();
    await auth.login(semCookie(), res, "abc123");
    const req = comCookie(cookieDe(res));
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(auth.authenticated(req), false);
    assert.equal(createAuth({ hash, store }).authenticated(req), false);
  } finally {
    limpar();
  }
});

test("a corrupt or unreadable store does not stop the studio from booting", async () => {
  const { store, limpar } = comLoja();
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(store, "{isto não é json");
    const auth = createAuth({ hash: hashPassword("abc123"), store });
    assert.equal(auth.required(), true);
    assert.equal(auth.authenticated(semCookie()), false);
    // E continua utilizavel: um login novo tem de funcionar e regravar o arquivo.
    const res = fakeRes();
    await auth.login(semCookie(), res, "abc123");
    assert.equal(auth.authenticated(comCookie(cookieDe(res))), true);
    assert.ok(existsSync(store));
  } finally {
    limpar();
  }
});

test("without a store, nothing is written and the old behaviour stays", async () => {
  const auth = createAuth({ hash: hashPassword("abc123") });
  const res = fakeRes();
  await auth.login(semCookie(), res, "abc123");
  assert.equal(auth.authenticated(comCookie(cookieDe(res))), true);
});
