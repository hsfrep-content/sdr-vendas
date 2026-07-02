const config = require('./config');
const { ConversationStore } = require('./state/conversationStore');
const { WhatsAppWebClient } = require('./whatsapp/whatsappClient');
const { SdrAgent } = require('./sdrAgent');
const { createDashboardApp } = require('./web/server');

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
    console.log(`Painel disponível em http://${config.dashboardHost}:${config.dashboardPort}`);
  });

  await whatsappClient.initialize();
}

main().catch((err) => {
  console.error('Erro ao iniciar o agente de SDR:', err);
  process.exit(1);
});
