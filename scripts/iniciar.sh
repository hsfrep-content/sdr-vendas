#!/usr/bin/env bash
#
# Instalador e lançador do Agente de SDR (Linux).
#
# Uso — cole UMA linha no terminal:
#   curl -fsSL https://raw.githubusercontent.com/hsfrep-content/sdr-vendas/claude/whatsapp-sdr-real-estate-2ro8ry/scripts/iniciar.sh | bash
#
# O script instala o que faltar (git/Node.js), baixa/atualiza o projeto em ~/sdr-vendas,
# inicia o agente e abre o painel no navegador, onde você envia a planilha e escaneia o QR code.
# Rodá-lo de novo depois só atualiza e inicia (não reinstala nada).
set -euo pipefail

REPO_URL="${SDR_REPO_URL:-https://github.com/hsfrep-content/sdr-vendas.git}"
BRANCH="${SDR_BRANCH:-claude/whatsapp-sdr-real-estate-2ro8ry}"
DIR="${SDR_DIR:-$HOME/sdr-vendas}"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }

# Instalações anteriores rodadas com sudo (por engano) podem deixar arquivos de dono "root"
# nessas pastas, travando qualquer execução seguinte com erros de permissão (git "dubious
# ownership", EACCES ao baixar o Chrome, etc). Corrige o dono sempre que detectar isso.
fix_ownership() {
  local path="$1"
  [ -e "$path" ] || return 0
  if [ -n "$(find "$path" -maxdepth 1 ! -user "$(id -un)" -print -quit 2>/dev/null)" ]; then
    log "Corrigindo permissões de $path (vai pedir sua senha de administrador)..."
    sudo chown -R "$(id -un):$(id -gn)" "$path" || fail "não consegui corrigir as permissões. Rode: sudo chown -R \$USER:\$USER $path"
  fi
}

# --- 1. git ---------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  log "git não encontrado. Instalando (vai pedir sua senha de administrador)..."
  sudo apt-get update -y && sudo apt-get install -y git || fail "não consegui instalar o git. Instale manualmente (sudo apt-get install git) e rode este script de novo."
fi

# --- 2. Node.js 18+ -------------------------------------------------------
node_ok=false
if command -v node >/dev/null 2>&1; then
  major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$major" -ge 18 ] 2>/dev/null && node_ok=true
fi
if [ "$node_ok" != true ]; then
  log "Node.js 18+ não encontrado. Instalando (vai pedir sua senha de administrador)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - \
    && sudo apt-get install -y nodejs \
    || fail "não consegui instalar o Node.js. Instale manualmente (https://nodejs.org) e rode este script de novo."
fi
log "Node.js $(node -v) OK."

# --- 3. Baixar ou atualizar o projeto --------------------------------------
if [ -d "$DIR/.git" ]; then
  log "Projeto já existe em $DIR — atualizando..."
  fix_ownership "$DIR"
  git config --global --add safe.directory "$DIR" 2>/dev/null || true
  git -C "$DIR" fetch origin "$BRANCH"
  git -C "$DIR" checkout "$BRANCH"
  git -C "$DIR" pull --ff-only origin "$BRANCH" || log "Aviso: não consegui atualizar (mudanças locais?). Seguindo com a versão atual."
else
  log "Baixando o projeto para $DIR..."
  git clone -b "$BRANCH" "$REPO_URL" "$DIR"
fi
cd "$DIR"

# --- 4. Dependências e configuração ----------------------------------------
fix_ownership "$HOME/.cache/puppeteer"
fix_ownership "$HOME/.npm"
if [ ! -d node_modules ]; then
  log "Instalando dependências (a primeira vez baixa o navegador interno, ~200MB — pode demorar alguns minutos)..."
  npm install --no-fund --no-audit
else
  log "Dependências já instaladas."
fi

# O WhatsApp Web roda dentro de um Chrome interno baixado pelo puppeteer. Uma instalação
# interrompida pode deixar as dependências sem esse navegador, então garante aqui — o
# comando é rápido e não baixa nada quando o Chrome já está presente.
log "Verificando o navegador interno (Chrome)..."
npx puppeteer browsers install chrome || fail "não consegui baixar o navegador interno. Verifique a conexão e rode este script de novo."

[ -f .env ] || { cp .env.example .env; log "Arquivo de configuração .env criado (edite depois se quiser mudar textos/números)."; }

# --- 5. Iniciar -------------------------------------------------------------
log "Iniciando o agente. O painel vai abrir sozinho no navegador (ou acesse http://localhost:3000)."
log "Para encerrar, volte a este terminal e pressione Ctrl+C."
exec npm start
