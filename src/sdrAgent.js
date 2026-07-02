const { loadAuthorizedContacts } = require('./contacts/loadContacts');
const { buildInitialMessage } = require('./messaging/template');
const { classifyIntent } = require('./nlp/interestClassifier');
const { triggerHumanHandoff } = require('./handoff/humanHandoff');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(min + Math.random() * (max - min));

const MAX_CLARIFICATION_ATTEMPTS = 1;

// Orquestra a campanha de reaproximação:
//  1. Envia a mensagem inicial apenas a contatos que autorizaram previamente o contato.
//  2. Para cada contato, aguarda a resposta (não envia nada mais até o cliente responder).
//  3. Ao identificar interesse, interrompe o fluxo automático e aciona o atendimento humano.
//  4. Respeita pedidos de descadastro e não insiste em respostas ambíguas.
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

  async handleIncomingMessage({ from, name, body }) {
    const state = this.store.get(from);
    // Só reage a respostas de contatos que a campanha efetivamente iniciou e que ainda
    // aguardam retorno; conversas já encerradas ou em atendimento humano não são tocadas.
    if (!state || state.status !== 'awaiting_reply') return null;

    const contact = { name: state.name || name, whatsappId: from };
    const { intent, matchedKeyword } = classifyIntent(body);

    if (intent === 'interested') {
      const nameSuffix = contact.name ? `, ${contact.name}` : '';
      await this.whatsappClient.sendMessage(
        from,
        `Que ótimo${nameSuffix}! Vou te conectar agora com um de nossos consultores para continuar o papo com calma. 🙌`
      );
      const entry = await this._handoff(contact, body, 'interesse_detectado');
      return { action: 'handoff', intent, matchedKeyword, entry };
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

    // Resposta ambígua: pergunta com calma uma única vez; se continuar sem clareza,
    // aciona um humano em vez de insistir repetidamente com o cliente.
    const attempts = (state.clarificationAttempts || 0) + 1;
    if (attempts > MAX_CLARIFICATION_ATTEMPTS) {
      const entry = await this._handoff(contact, body, 'resposta_ambigua');
      await this.whatsappClient.sendMessage(
        from,
        'Vou chamar um de nossos consultores para te ajudar melhor, tudo bem? Ele já te retorna por aqui. 🙂'
      );
      return { action: 'handoff', intent, entry };
    }

    const nameSuffix = contact.name ? `, ${contact.name}` : '';
    await this.whatsappClient.sendMessage(
      from,
      `Sem pressa${nameSuffix}! Só pra eu entender melhor: você teria interesse em vender, alugar ou comprar algum imóvel?`
    );
    this.store.set(from, { status: 'awaiting_reply', clarificationAttempts: attempts });
    return { action: 'clarify', intent };
  }
}

module.exports = { SdrAgent };
