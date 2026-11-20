#!/bin/sh
# Monta a pasta dist/ (o que vai para o ar) e liga o site ao painel.
# Roda sozinho no "wrangler deploy" (veja [build] no wrangler.toml), tanto no
# GitHub Actions quanto no deploy pelo próprio painel da Cloudflare.
set -eu
cd "$(dirname "$0")/.."
PANEL_URL="${PANEL_URL:-https://painel-balcao.moshikg10.workers.dev}"

if [ -d dist ]; then rm -rf dist; fi
mkdir dist
tar --exclude=./.git --exclude=./.github --exclude=./dist --exclude='./*-api' --exclude='*.md' \
    --exclude=./wrangler.toml --exclude=./scripts --exclude=node_modules --exclude='./_e2e*' \
    --exclude=./.wrangler --exclude='*.log' \
    -cf - . | tar -xf - -C dist

if [ -e dist/.wrangler ] || ls dist/*.log >/dev/null 2>&1; then echo "Arquivo interno entrou no site." >&2; exit 1; fi

sed -i "s#panelApi: \"\",#panelApi: \"$PANEL_URL\",#" dist/index.html
for f in dist/painel/index.html dist/acompanhar/index.html dist/telao/index.html; do
  sed -i "s#const API_PADRAO = \"\";#const API_PADRAO = \"$PANEL_URL\";#" "$f"
  grep -q "API_PADRAO = \"$PANEL_URL\"" "$f" || { echo "Não consegui ligar $f ao painel." >&2; exit 1; }
done
grep -q "panelApi: \"$PANEL_URL\"" dist/index.html || { echo "Não consegui ligar o site ao painel." >&2; exit 1; }
[ -f dist/404.html ] || cp dist/index.html dist/404.html
echo "Site montado em dist/ (painel: $PANEL_URL)"
