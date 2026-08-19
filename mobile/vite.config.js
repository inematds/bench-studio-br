import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Mesma leitura de .env que o vite.config.js do desktop faz, e pelo mesmo
// motivo: o Vite nao carrega .env em `process.env` enquanto avalia este arquivo,
// entao sem isto a porta e o host cairiam no padrao e discordariam do servidor.
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
loadEnvFile(join(ROOT, ".env"));
loadEnvFile(join(homedir(), ".env"));

const apiPort = Number(process.env.BENCH_API_PORT || process.env.PORT || 8787);
const port = Number(process.env.BENCH_MOBILE_PORT || 5300);

// O padrao aqui e 0.0.0.0, ao contrario do desktop: uma interface de celular que
// so responde em 127.0.0.1 nao serve para nada — o telefone nunca e a maquina
// que roda o estudio. Quem quiser prender no loopback exporta BENCH_MOBILE_HOST.
const host = process.env.BENCH_MOBILE_HOST || "0.0.0.0";

// As quatro rotas de arquivo (media, inputs, previews, projects) sao servidas
// pela API, nao por este servidor. Sem elas no proxy, a galeria abre sem
// nenhuma imagem — foi assim que o desktop descobriu isso.
const proxied = ["/api", "/media", "/inputs", "/previews", "/projects"];

// Na VPS o celular e servido pelo nginx em /m/, e nao na raiz do dominio: sem
// isto os arquivos gerados apontariam para /assets/... e a pagina abriria em
// branco. Em desenvolvimento a base continua sendo "/".
const base = process.env.BENCH_MOBILE_BASE || "/";

export default defineConfig({
  base,
  root: HERE,
  plugins: [react()],
  server: {
    host,
    port,
    strictPort: true,
    proxy: Object.fromEntries(
      proxied.map((path) => [path, { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true }]),
    ),
  },
  build: { outDir: join(ROOT, "dist-mobile"), emptyOutDir: true },
});
