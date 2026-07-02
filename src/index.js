const config = require('./config');
const { ConversationStore } = require('./state/conversationStore');
const { WhatsAppWebClient } = require('./whatsapp/whatsappClient');
const { SdrAgent } = require('./sdrAgent');
const { createDashboardApp } = require('./web/server');

// Um erro não tratado em algum callback interno do puppeteer/whatsapp-web.js (ex.: o Chrome
// travando no meio da sincronização inicial) derrubaria o processo Node inteiro por padrão —
// e junto dele o painel, mesmo sem relação nenhuma com a conexão do WhatsApp. Só registra o
// erro e mantém o processo de pé; o estado "connection_error" já cobre o usuário no painel.
process.on('unhandledRejection', (reason) => {
  console.error('Erro não tratado (unhandledRejection):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Erro não tratado (uncaughtException):', err);
});

async function main() {
  const store = new ConversationStore(config.stateFile);
  const whatsappClient = new WhatsAppWebClient({ sessionPath: config.sessionPath });

  const notifyHuman = config.handoffNotifyNumber
    ? (entry) =>
        whatsappClient.sendMessage(
          `${config.handoffNotifyNumber}@c.us`,
          [
            '🔔 Novo lead quente!',
            `Nome: ${entry.name}`,
            `Contato: ${entry.whatsappId}`,
            `Última mensagem: "${entry.lastMessage}"`,
            `Motivo: ${entry.reason}`,
          ].join('\n')
        )
    : undefined;

  const agent = new SdrAgent({ whatsappClient, store, config, notifyHuman });

  whatsappClient.onReady(async () => {
    console.log('WhatsApp conectado. Iniciando campanha de reaproximação...');
    await agent.runCampaign();
    console.log('Envio de mensagens iniciais concluído. Aguardando respostas dos clientes...');
  });

  const dashboardApp = createDashboardApp({ config, whatsappClient, store, agent });
  dashboardApp.listen(config.dashboardPort, config.dashboardHost, () => {
    const url = `http://localhost:${config.dashboardPort}`;
    console.log(`Painel disponível em ${url}`);
    if (config.autoOpenBrowser) openInBrowser(url);
  });

  // Falha ao conectar no WhatsApp (internet fora do ar, o Chrome travando durante a
  // sincronização inicial, bloqueio momentâneo etc.) não pode derrubar o painel: mantém a
  // página no ar mostrando o erro e tenta de novo sozinho, tanto na primeira conexão quanto
  // se a sessão cair mais tarde (ex.: o celular ficou sem internet, o Chrome interno travou).
  const RETRY_DELAY_MS = 30000;
  let connecting = false;
  async function connectWithRetry() {
    if (connecting) return;
    connecting = true;
    try {
      for (;;) {
        try {
          await whatsappClient.initialize();
          return;
        } catch (err) {
          console.error(`Não consegui conectar ao WhatsApp: ${err.message}`);
          console.error(`Tentando de novo em ${RETRY_DELAY_MS / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } finally {
      connecting = false;
    }
  }

  whatsappClient.onStateChange((state) => {
    if (state === 'disconnected') {
      console.warn('Conexão com o WhatsApp caiu. Tentando reconectar automaticamente...');
      connectWithRetry();
    }
  });

  await connectWithRetry();
}

// Tenta abrir o painel no navegador padrão da máquina. É só uma conveniência: se não houver
// interface gráfica/navegador (ex.: servidor acessado por SSH), falha em silêncio e o
// usuário abre a URL manualmente.
function openInBrowser(url) {
  const { spawn } = require('child_process');
  const commands = { linux: ['xdg-open', [url]], darwin: ['open', [url]], win32: ['cmd', ['/c', 'start', '', url]] };
  const command = commands[process.platform];
  if (!command) return;
  try {
    spawn(command[0], command[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch (err) {
    // Sem navegador disponível; o link já foi impresso no terminal.
  }
}

main().catch((err) => {
  console.error('Erro ao iniciar o agente de SDR:', err);
  process.exit(1);
});
