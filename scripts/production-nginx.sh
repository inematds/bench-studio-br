#!/usr/bin/env bash
# Degrau 2, parte 2 de 2: nginx na frente, com TLS.
#
# Serve o `dist/` como arquivo estatico e repassa ao Node so o que e do Node.
# O detalhe que passa despercebido: /media, /inputs, /previews e /projects NAO
# sao arquivos do dist/ — sao rotas servidas pela API (server.mjs). Se o nginx
# tentar resolve-las no disco, todo resultado gerado aparece quebrado. Por isso
# elas vao para o proxy junto com /api.
#
#   ./scripts/production-nginx.sh --domain estudio.exemplo.com --email voce@exemplo.com
#   ./scripts/production-nginx.sh --domain estudio.exemplo.com --no-tls
#   ./scripts/production-nginx.sh --domain x.com --print     # so mostra, nao grava
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

DOMAIN=""
EMAIL=""
NAME="bench-studio"
API_PORT="${BENCH_API_PORT:-${PORT:-8787}}"
TLS=1
PRINT=0
CLOSE_WEB=1

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?--domain precisa de um valor}"; shift 2 ;;
    --email)  EMAIL="${2:?--email precisa de um valor}"; shift 2 ;;
    --name)   NAME="${2:?--name precisa de um valor}"; shift 2 ;;
    --api-port) API_PORT="${2:?--api-port precisa de um valor}"; shift 2 ;;
    --no-tls) TLS=0; shift ;;
    --keep-web-port) CLOSE_WEB=0; shift ;;
    --print)  PRINT=1; shift ;;
    *) printf 'opcao desconhecida: %s\n' "$1" >&2; exit 1 ;;
  esac
done

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mx  %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "faltou --domain. O Let's Encrypt nao emite certificado para IP nu; e preciso um dominio apontando para esta maquina."
[ -f dist/index.html ] || die "nao existe dist/. Rode antes: ./scripts/production-build.sh"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "rode como root ou instale o sudo."
  SUDO="sudo"
fi

# `client_max_body_size` alto porque referencia de imagem/video sobe por aqui: o
# padrao do nginx (1 MB) recusaria um upload comum com 413, e o erro apareceria
# na tela como falha do estudio.
# `proxy_read_timeout` longo porque geracao de video demora minutos; o padrao de
# 60s cortaria a espera e o usuario veria 504 num pedido que estava sadio.
SITE="server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${ROOT}/dist;
    index index.html;

    client_max_body_size 128m;

    # Aplicacao de pagina unica: qualquer rota desconhecida devolve o index e o
    # roteamento acontece no navegador.
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Arquivos com hash no nome podem ser guardados para sempre; o index nao.
    location /assets/ {
        expires 1y;
        add_header Cache-Control \"public, immutable\";
    }

    # Tudo que e do Node. As quatro ultimas sao rotas de arquivo servidas pela
    # API, nao pelo dist/ — sem elas os resultados aparecem quebrados.
    location ~ ^/(api|media|inputs|previews|projects)/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
        proxy_buffering off;
    }
}
"

if [ "$PRINT" = "1" ]; then
  printf '%s' "$SITE"
  exit 0
fi

bold "1/5  nginx instalado?"
if ! command -v nginx >/dev/null 2>&1; then
  warn "nginx nao encontrado — instalando"
  $SUDO apt-get update -qq && $SUDO apt-get install -y nginx
fi
printf '     %s\n' "$(nginx -v 2>&1)"

bold "2/5  gravando o site"
AVAIL="/etc/nginx/sites-available/${NAME}"
printf '%s' "$SITE" | $SUDO tee "$AVAIL" >/dev/null
$SUDO ln -sf "$AVAIL" "/etc/nginx/sites-enabled/${NAME}"
[ -e /etc/nginx/sites-enabled/default ] && $SUDO rm -f /etc/nginx/sites-enabled/default
printf '     %s\n' "$AVAIL"

bold "3/5  conferindo e recarregando"
$SUDO nginx -t
$SUDO systemctl reload nginx
printf '     nginx recarregado\n'

bold "4/5  firewall"
if command -v ufw >/dev/null 2>&1 && $SUDO ufw status | head -1 | grep -qi active; then
  $SUDO ufw allow 80/tcp >/dev/null
  $SUDO ufw allow 443/tcp >/dev/null
  printf '     80 e 443 liberadas\n'
  if [ "$CLOSE_WEB" = "1" ]; then
    WEB_PORT="${BENCH_WEB_PORT:-5200}"
    $SUDO ufw delete allow "${WEB_PORT}/tcp" >/dev/null 2>&1 || true
    printf '     %s fechada — quem entra agora entra pelo nginx\n' "$WEB_PORT"
  fi
else
  warn "ufw inativo ou ausente: libere 80 e 443 pelo painel do seu provedor."
fi

bold "5/5  certificado"
if [ "$TLS" = "0" ]; then
  warn "TLS pulado (--no-tls). O trafego, INCLUSIVE A SENHA, viaja legivel."
else
  if ! command -v certbot >/dev/null 2>&1; then
    warn "certbot nao encontrado — instalando"
    $SUDO apt-get install -y certbot python3-certbot-nginx
  fi
  if [ -n "$EMAIL" ]; then
    $SUDO certbot --nginx -d "$DOMAIN" --agree-tos -m "$EMAIL" --redirect --non-interactive
  else
    warn "sem --email: o certbot vai perguntar as coisas na tela."
    $SUDO certbot --nginx -d "$DOMAIN" --redirect
  fi
fi

cat <<EOF

  Pronto. Confira, nesta ordem:

    curl -sI http://${DOMAIN}            # deve responder 301 para https
    curl -s https://${DOMAIN}/api/health # {"ok":true,...} ou authRequired

  Abra https://${DOMAIN} no navegador.

  A API continua so em 127.0.0.1 — quem fala com ela e o nginx.
  A porta ${BENCH_WEB_PORT:-5200} nao precisa mais ficar aberta.

  Depois de CADA atualizacao:
    npm run update && ./scripts/production-build.sh
  (o nginx nao precisa ser mexido de novo; ele serve o dist/ novo na hora)

EOF
