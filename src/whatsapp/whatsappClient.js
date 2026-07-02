const { Client, LocalAuth, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fina camada sobre whatsapp-web.js: autenticação por QR code (mesmo número usado no
// WhatsApp Web), envio de mensagens com uma pequena simulação de "digitando..." para soar
// mais natural, e repasse de mensagens recebidas para quem se inscrever via onMessage().
class WhatsAppWebClient {
  constructor({ sessionPath = '.wwebjs_auth', puppeteerOptions = {} } = {}) {
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...puppeteerOptions,
      },
    });

    this._messageHandlers = [];

    this.client.on('qr', (qr) => {
      console.log('Escaneie o QR code abaixo com o WhatsApp do número do agente:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('auth_failure', (msg) => console.error('Falha de autenticação no WhatsApp Web:', msg));
    this.client.on('disconnected', (reason) => console.warn('WhatsApp desconectado:', reason));

    this.client.on('message', async (msg) => {
      if (msg.fromMe) return;
      const contact = await msg.getContact().catch(() => null);
      const payload = {
        from: msg.from,
        body: msg.body,
        name: contact?.pushname || contact?.name || null,
        selectedRowId: msg.selectedRowId || null,
        raw: msg,
      };
      for (const handler of this._messageHandlers) {
        await handler(payload);
      }
    });
  }

  onMessage(handler) {
    this._messageHandlers.push(handler);
  }

  onReady(handler) {
    this.client.on('ready', handler);
  }

  async initialize() {
    await this.client.initialize();
  }

  async _simulateTyping(whatsappId) {
    try {
      const chat = await this.client.getChatById(whatsappId);
      await chat.sendStateTyping();
      await sleep(1200 + Math.random() * 1500);
    } catch (err) {
      // Simulação de digitação é apenas cosmética; segue com o envio mesmo se falhar.
    }
  }

  async sendMessage(whatsappId, text) {
    await this._simulateTyping(whatsappId);
    return this.client.sendMessage(whatsappId, text);
  }

  // Envia a "caixa de seleção" como uma lista interativa nativa do WhatsApp. Esse recurso
  // depende de suporte do WhatsApp para contas fora da API oficial de empresas e pode falhar
  // silenciosamente ou ser rejeitado; nesse caso, cai automaticamente para um menu em texto
  // simples com as mesmas opções, para o cliente nunca ficar sem receber a pergunta.
  async sendSelectionMenu(whatsappId, { body, buttonText, footer, options }) {
    await this._simulateTyping(whatsappId);
    try {
      const list = new List(body, buttonText, [{ rows: options.map((o) => ({ id: o.id, title: o.title })) }], undefined, footer);
      return await this.client.sendMessage(whatsappId, list);
    } catch (err) {
      const fallbackText = [body, options.map((o, i) => `${i + 1}. ${o.title}`).join('\n'), footer]
        .filter(Boolean)
        .join('\n\n');
      return this.client.sendMessage(whatsappId, fallbackText);
    }
  }
}

module.exports = { WhatsAppWebClient };
