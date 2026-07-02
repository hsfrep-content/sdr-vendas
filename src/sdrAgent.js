const { loadAuthorizedContacts } = require('./contacts/loadContacts');
const { buildInitialMessage } = require('./messaging/template');
const {
  SELECTION_OPTIONS,
  SELECTION_MENU_BODY,
  SELECTION_MENU_BUTTON_TEXT,
  SELECTION_MENU_FOOTER,
  findOptionById,
  matchOptionByNumber,
} = require('./messaging/selectionMenu');
const { classifyIntent } = require('./nlp/interestClassifier');
const { triggerHumanHandoff } = require('./handoff/humanHandoff');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(min + Math.random() * (max - min));

// Orquestra a campanha de reaproximação:
//  1. Envia a mensagem inicial apenas a contatos que autorizaram previamente o contato.
//  2. Assim que o cliente responder qualquer coisa, envia uma caixa de seleção com as
//     opções (vender / sem interesse / parar de receber mensagens).
//  3. A escolha do cliente decide o próximo passo; qualquer resposta fora dessas opções
//     é tratada como "quero falar com alguém" e aciona o atendimento humano direto.
//  4. Ao identificar interesse, interrompe o fluxo automático e aciona o atendimento humano.
//  5. Respeita pedidos de descadastro permanentemente, mesmo em campanhas futuras.
class SdrAgent {
  constructor({ whatsappClient, store, config, logger = console, notifyHuman }) {
    this.whatsappClient = whatsappClient;
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.notifyHuman = notifyHuman;

    this.whatsappClient.onMessage((message) => this.handleIncomingMessage(message));
  }

  loadAuthorizedContacts() {
    return loadAuthorizedContacts(this.config.contactsFile, {
      defaultCountryCode: this.config.defaultCountryCode,
    }).filter((contact) => this.store.get(contact.whatsappId)?.status !== 'opted_out');
  }

  async runCampaign(contacts = this.loadAuthorizedContacts()) {
    for (const contact of contacts) {
      if (this.store.has(contact.whatsappId)) {
        this.logger.log(`Pulando ${contact.name}: já contatado anteriormente.`);
        continue;
      }

      const text = buildInitialMessage(contact.name, this.config);
      await this.whatsappClient.sendMessage(contact.whatsappId, text);
      this.store.set(contact.whatsappId, {
        name: contact.name,
        status: 'awaiting_reply',
        lastOutboundMessage: text,
      });
      this.logger.log(`Mensagem inicial enviada para ${contact.name}.`);

      await sleep(randomDelay(this.config.minDelayMs, this.config.maxDelayMs));
    }
  }

  async _handoff(contact, body, reason) {
    const entry = await triggerHumanHandoff(
      { contact, message: body, reason },
      { queueFile: this.config.handoffQueueFile, notify: this.notifyHuman }
    );
    this.store.set(contact.whatsappId, { status: 'awaiting_human', handoff: entry });
    return entry;
  }

  async handleIncomingMessage({ from, name, body, selectedRowId }) {
    const state = this.store.get(from);
    // Só reage a respostas de contatos que a campanha efetivamente iniciou; conversas já
    // encerradas ou já em atendimento humano não são mais tocadas pelo fluxo automático.
    if (!state) return null;

    const contact = { name: state.name || name, whatsappId: from };

    if (state.status === 'awaiting_reply') {
      return this._sendSelectionMenu(contact);
    }

    if (state.status === 'awaiting_selection') {
      return this._resolveSelection(contact, { body, selectedRowId });
    }

    return null;
  }

  async _sendSelectionMenu(contact) {
    await this.whatsappClient.sendSelectionMenu(contact.whatsappId, {
      body: SELECTION_MENU_BODY,
      buttonText: SELECTION_MENU_BUTTON_TEXT,
      footer: SELECTION_MENU_FOOTER,
      options: SELECTION_OPTIONS,
    });
    this.store.set(contact.whatsappId, { status: 'awaiting_selection' });
    return { action: 'menu_sent' };
  }

  async _resolveSelection(contact, { body, selectedRowId }) {
    const from = contact.whatsappId;
    const selectedOption = (selectedRowId && findOptionById(selectedRowId)) || matchOptionByNumber(body);
    const intent = selectedOption ? selectedOption.intent : classifyIntent(body).intent;

    if (intent === 'interested') {
      const nameSuffix = contact.name ? `, ${contact.name}` : '';
      await this.whatsappClient.sendMessage(
        from,
        `Perfeito${nameSuffix}! Vou te conectar agora com o meu time de atendimento para avançarmos com o teu atendimento.`
      );
      const entry = await this._handoff(contact, body, 'interesse_detectado');
      return { action: 'handoff', intent, entry };
    }

    if (intent === 'opt_out') {
      await this.whatsappClient.sendMessage(
        from,
        'Sem problemas! Você não receberá mais mensagens nossas por aqui. Se mudar de ideia, estamos à disposição. 🙏'
      );
      this.store.set(from, { status: 'opted_out' });
      return { action: 'opt_out', intent };
    }

    if (intent === 'not_interested') {
      await this.whatsappClient.sendMessage(
        from,
        'Entendido, obrigado por responder! Fico à disposição caso mude de ideia. Tenha um ótimo dia! 😊'
      );
      this.store.set(from, { status: 'closed_not_interested' });
      return { action: 'closed', intent };
    }

    // Resposta fora das três opções do menu (ex.: "Oi, tudo bem?"): não insiste nem
    // repete o menu, aciona direto o atendimento humano para não deixar o cliente sem resposta.
    const nameSuffix = contact.name ? `, ${contact.name}` : '';
    await this.whatsappClient.sendMessage(
      from,
      `Sem problemas${nameSuffix}! Vou chamar meu time de atendimento pra te ajudar melhor, tudo bem? Já te retornam por aqui. 🙂`
    );
    const entry = await this._handoff(contact, body, 'resposta_fora_do_menu');
    return { action: 'handoff', intent, entry };
  }
}

module.exports = { SdrAgent };
