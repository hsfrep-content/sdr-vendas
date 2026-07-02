const { Client, LocalAuth } = require('whatsapp-web.js');
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

  async sendMessage(whatsappId, text) {
    try {
      const chat = await this.client.getChatById(whatsappId);
      await chat.sendStateTyping();
      await sleep(1200 + Math.random() * 1500);
    } catch (err) {
      // Simulação de digitação é apenas cosmética; segue com o envio mesmo se falhar.
    }
    return this.client.sendMessage(whatsappId, text);
  }
}

module.exports = { WhatsAppWebClient };
