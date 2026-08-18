import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const HERE = dirname(fileURLToPath(import.meta.url));

// MEDIDO NUMA VPS (2026-08-18): `remote.sh open` gravava BENCH_WEB_HOST=0.0.0.0
// no .env, o script dizia OPEN, o ufw liberava a porta — e o Vite continuava
// escutando so em 127.0.0.1. Motivo: o Vite NAO carrega .env no `process.env`
// enquanto avalia este arquivo, entao a leitura abaixo caia no padrao. O
// servidor lia o .env por conta propria (server.mjs) e a interface nao, o que
// deixava os dois lados discordando sem ninguem reclamar.
//
// Mesma precedencia do servidor: exportado no shell > .env do projeto > ~/.env.
function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile(join(HERE, ".env"));
loadEnvFile(join(homedir(), ".env"));

const webPort = Number(process.env.BENCH_WEB_PORT || 5200);
const apiPort = Number(process.env.BENCH_API_PORT || process.env.PORT || 8787);
const apiTarget = `http://localhost:${apiPort}`;
// LAN: BENCH_WEB_HOST=0.0.0.0 expõe a UI na rede local (padrão: só loopback).
const webHost = process.env.BENCH_WEB_HOST || "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  server: {
    host: webHost,
    port: webPort,
    // Porta ocupada = ERRO, nao "pega a proxima". O fallback silencioso do Vite
    // subia uma segunda interface em 5201 quando ja havia uma instancia viva:
    // duas telas no ar, so uma liberada no firewall, e a pessoa testando a que
    // ninguem alcanca. Falhar aqui mostra o que realmente aconteceu.
    strictPort: true,
    allowedHosts: true,
    proxy: {
      // xfwd repassa o IP de origem em X-Forwarded-For. Sem isto a API ve TODO
      // mundo como 127.0.0.1 (quem fala com ela e o proxy, na mesma maquina) — e
      // a trava "so grava chave quem esta na maquina" nao travaria ninguem.
      "/api": { target: apiTarget, changeOrigin: true, xfwd: true },
      "/media": { target: apiTarget, changeOrigin: true, xfwd: true },
      "/previews": { target: apiTarget, changeOrigin: true, xfwd: true },
      "/inputs": { target: apiTarget, changeOrigin: true, xfwd: true },
      "/projects": { target: apiTarget, changeOrigin: true, xfwd: true },
    },
  },
});
