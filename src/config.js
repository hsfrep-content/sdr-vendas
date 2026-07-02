require('dotenv').config();

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  companyName: process.env.AGENT_COMPANY_NAME || 'A&L Negócios Imobiliários',
  agentName: process.env.AGENT_SIGNATURE_NAME || 'Linhares',
  agentRole: process.env.AGENT_ROLE || 'corretor de imóveis e gestor de negócios',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '55',

  contactsFile: process.env.CONTACTS_FILE || 'data/contacts.csv',
  stateFile: process.env.STATE_FILE || 'data/state.json',
  handoffQueueFile: process.env.HANDOFF_QUEUE_FILE || 'data/handoff-queue.json',
  sessionPath: process.env.WHATSAPP_SESSION_PATH || '.wwebjs_auth',

  // Intervalo aleatório entre mensagens para simular ritmo humano e evitar bloqueio por spam.
  minDelayMs: int('MESSAGE_MIN_DELAY_MS', 8000),
  maxDelayMs: int('MESSAGE_MAX_DELAY_MS', 20000),

  // Número/grupo interno (formato E.164 sem símbolos, ex: 5511999998888) que recebe o aviso de handoff.
  handoffNotifyNumber: process.env.HANDOFF_NOTIFY_NUMBER || null,

  // Painel web local para escanear o QR code e enviar a planilha de contatos pelo navegador.
  // Por padrão só aceita conexões da própria máquina (127.0.0.1) — o QR code e os contatos
  // são dados sensíveis, então evite expor DASHBOARD_HOST para fora da rede local sem proteção.
  dashboardHost: process.env.DASHBOARD_HOST || '127.0.0.1',
  dashboardPort: int('DASHBOARD_PORT', 3000),
  dashboardToken: process.env.DASHBOARD_TOKEN || null,

  // Abre o painel no navegador automaticamente ao iniciar (defina como "false" em servidores
  // sem interface gráfica; a abertura também falha em silêncio quando não há navegador).
  autoOpenBrowser: process.env.AUTO_OPEN_BROWSER !== 'false',
};
