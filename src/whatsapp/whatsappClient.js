const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHROME_LOCK_FILES = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie']);

// Se o processo for encerrado de forma abrupta (terminal fechado, computador suspenso),
// o Chrome interno pode deixar para trás arquivos de "cadeado" na pasta de sessão. Na
// próxima vez, o puppeteer recusa iniciar com "The browser is already running" mesmo
// sem nenhum processo de verdade rodando. Como isto roda antes de qualquer Chrome deste
// processo ser aberto, qualquer cadeado encontrado aqui é necessariamente obsoleto.
function removeStaleBrowserLocks(sessionPath) {
  const root = path.resolve(sessionPath);
  if (!fs.existsSync(root)) return;

  const pending = [root];
  while (pending.length) {
    const dir = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (CHROME_LOCK_FILES.has(entry.name)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (err) {
          // Se não conseguir remover, deixa o puppeteer reportar o erro normalmente.
        }
      }
    }
  }
}

// Fina camada sobre whatsapp-web.js: autenticação por QR code (mesmo número usado no
// WhatsApp Web), envio de mensagens com uma pequena simulação de "digitando..." para soar
// mais natural, e repasse de mensagens recebidas para quem se inscrever via onMessage().
//
// Também mantém o estado da conexão (waiting_qr/authenticating/ready/disconnected) e o
// último QR code recebido, para que o painel web (src/web/server.js) consiga exibir o
// código como imagem em vez de depender só do terminal.
class WhatsAppWebClient {
  constructor({ sessionPath = '.wwebjs_auth', puppeteerOptions = {} } = {}) {
    this.sessionPath = sessionPath;
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // Evita que o Chrome use /dev/shm (costuma ser pequeno demais em muitas máquinas
          // Linux) para memória compartilhada entre processos. Sem isso, a fase de
          // sincronização inicial do WhatsApp Web — que carrega bastante histórico de uma
          // vez — pode esgotar esse espaço e derrubar a aba com "Page crashed!", levando o
          // processo inteiro (painel incluso) junto.
          '--disable-dev-shm-usage',
        ],
        ...puppeteerOptions,
      },
    });

    this._messageHandlers = [];
    this._stateChangeHandlers = [];
    this.state = 'waiting_qr';
    this.lastQr = null;

    this.client.on('qr', (qr) => {
      this.lastQr = qr;
      this._setState('waiting_qr');
      console.log('Escaneie o QR code abaixo com o WhatsApp do número do agente:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('authenticated', () => {
      this.lastQr = null;
      this._setState('authenticating');
    });

    this.client.on('ready', () => this._setState('ready'));

    this.client.on('auth_failure', (msg) => {
      this._setState('auth_failure');
      console.error('Falha de autenticação no WhatsApp Web:', msg);
    });

    this.client.on('disconnected', (reason) => {
      this._setState('disconnected');
      console.warn('WhatsApp desconectado:', reason);
    });

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

  _setState(state) {
    this.state = state;
    for (const handler of this._stateChangeHandlers) handler(state);
  }

  getState() {
    return this.state;
  }

  getLastQr() {
    return this.lastQr;
  }

  onStateChange(handler) {
    this._stateChangeHandlers.push(handler);
  }

  onMessage(handler) {
    this._messageHandlers.push(handler);
  }

  onReady(handler) {
    this.client.on('ready', handler);
  }

  async initialize() {
    try {
      removeStaleBrowserLocks(this.sessionPath);
      await this.client.initialize();
    } catch (err) {
      this._setState('connection_error');
      throw err;
    }
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

module.exports = { WhatsAppWebClient, removeStaleBrowserLocks };
