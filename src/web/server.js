const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { parseContactsCsv, loadContacts } = require('../contacts/loadContacts');
const { escapeHtml } = require('./html');

const STATE_LABELS = {
  waiting_qr: { label: 'Aguardando leitura do QR code', color: '#b45309', bg: '#fef3c7' },
  authenticating: { label: 'Autenticando...', color: '#1d4ed8', bg: '#dbeafe' },
  ready: { label: 'Conectado', color: '#15803d', bg: '#dcfce7' },
  auth_failure: { label: 'Falha na autenticação — reinicie o processo', color: '#b91c1c', bg: '#fee2e2' },
  disconnected: { label: 'Desconectado — reinicie o processo', color: '#b91c1c', bg: '#fee2e2' },
  connection_error: {
    label: 'Não consegui conectar ao WhatsApp — veja a mensagem de erro no terminal; tentando de novo automaticamente',
    color: '#b91c1c',
    bg: '#fee2e2',
  },
};

function readHandoffQueue(filePath) {
  try {
    const queue = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
    return Array.isArray(queue) ? queue.slice().reverse() : [];
  } catch (err) {
    return [];
  }
}

function readContactsSummary(filePath, defaultCountryCode) {
  try {
    const contacts = loadContacts(filePath, { defaultCountryCode });
    return { exists: true, total: contacts.length, authorized: contacts.filter((c) => c.consent).length };
  } catch (err) {
    return { exists: false, total: 0, authorized: 0 };
  }
}

function renderPage({ config, whatsappClient, store, notice, error }) {
  const state = whatsappClient.getState();
  const stateInfo = STATE_LABELS[state] || { label: state, color: '#374151', bg: '#e5e7eb' };
  const contactsSummary = readContactsSummary(config.contactsFile, config.defaultCountryCode);
  const handoffQueue = readHandoffQueue(config.handoffQueueFile).slice(0, 50);

  const statuses = store.values().reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});

  const qrSection =
    state === 'waiting_qr' && whatsappClient.getLastQr()
      ? `
        <div class="card">
          <h2>1. Escaneie o QR code</h2>
          <p>Abra o WhatsApp no celular do número que vai atuar como agente → <strong>Configurações → Aparelhos conectados → Conectar um aparelho</strong> → aponte a câmera para o código abaixo.</p>
          <img class="qr" src="/qr.png?ts=${Date.now()}" alt="QR code de autenticação do WhatsApp" width="280" height="280" />
          <p class="muted">O código muda a cada ~20s; esta página se atualiza sozinha.</p>
        </div>`
      : state === 'ready'
        ? `<div class="card"><h2>1. Conexão com o WhatsApp</h2><p>✅ Já está conectado. Não precisa escanear nada.</p></div>`
        : `<div class="card"><h2>1. Conexão com o WhatsApp</h2><p>Aguardando o WhatsApp gerar um novo QR code...</p></div>`;

  const noticeBanner = notice ? `<div class="banner banner-ok">${escapeHtml(notice)}</div>` : '';
  const errorBanner = error ? `<div class="banner banner-error">${escapeHtml(error)}</div>` : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Agente de SDR — ${escapeHtml(config.companyName)}</title>
<meta http-equiv="refresh" content="15" />
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #111827; margin: 0; padding: 24px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  .subtitle { color: #6b7280; margin-top: 0; margin-bottom: 20px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 600; font-size: 0.85rem; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; }
  .card h2 { font-size: 1.05rem; margin-top: 0; }
  .qr { display: block; margin: 12px auto; border: 1px solid #e5e7eb; border-radius: 8px; }
  .muted { color: #6b7280; font-size: 0.9rem; }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; }
  .stat { background: #f9fafb; border-radius: 8px; padding: 10px 16px; min-width: 120px; }
  .stat b { display: block; font-size: 1.3rem; margin-bottom: 4px; }
  form.upload { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
  input[type="file"] { flex: 1; min-width: 200px; }
  button { background: #111827; color: #fff; border: none; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
  button:hover { background: #1f2937; }
  button.secondary { background: #fff; color: #111827; border: 1px solid #d1d5db; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  th { color: #6b7280; font-weight: 600; }
  .banner { padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; }
  .banner-ok { background: #dcfce7; color: #15803d; }
  .banner-error { background: #fee2e2; color: #b91c1c; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Agente de SDR — ${escapeHtml(config.companyName)}</h1>
    <p class="subtitle">Status: <span class="badge" style="color:${stateInfo.color}; background:${stateInfo.bg}">${escapeHtml(stateInfo.label)}</span></p>

    ${noticeBanner}
    ${errorBanner}

    ${qrSection}

    <div class="card">
      <h2>2. Planilha de contatos</h2>
      ${
        contactsSummary.exists
          ? `<p>Planilha atual: <b>${contactsSummary.total}</b> contato(s) lidos, <b>${contactsSummary.authorized}</b> autorizado(s) (<code>consent=sim</code>).</p>`
          : `<p class="muted">Nenhuma planilha enviada ainda. Envie um CSV com as colunas <code>name,phone,consent</code>.</p>`
      }
      <form class="upload" action="/contacts" method="post" enctype="multipart/form-data">
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button type="submit">Enviar planilha</button>
      </form>
      <form action="/campaign/run" method="post" style="margin-top: 10px;">
        <button type="submit" class="secondary">Enviar mensagens para os contatos novos agora</button>
      </form>
      <p class="muted">Contatos já contatados anteriormente não recebem a mensagem de novo, mesmo reenviando a planilha.</p>
    </div>

    <div class="card">
      <h2>3. Andamento das conversas</h2>
      <div class="stats">
        <div class="stat"><b>${statuses.awaiting_reply || 0}</b>aguardando 1ª resposta</div>
        <div class="stat"><b>${statuses.awaiting_selection || 0}</b>aguardando seleção</div>
        <div class="stat"><b>${statuses.awaiting_human || 0}</b>com atendimento humano</div>
        <div class="stat"><b>${statuses.closed_not_interested || 0}</b>sem interesse</div>
        <div class="stat"><b>${statuses.opted_out || 0}</b>descadastrados</div>
      </div>
    </div>

    <div class="card">
      <h2>4. Leads aguardando atendimento humano</h2>
      ${
        handoffQueue.length === 0
          ? '<p class="muted">Nenhum lead na fila no momento.</p>'
          : `<table>
              <thead><tr><th>Nome</th><th>Contato</th><th>Última mensagem</th><th>Motivo</th><th>Quando</th></tr></thead>
              <tbody>
                ${handoffQueue
                  .map(
                    (entry) => `<tr>
                      <td>${escapeHtml(entry.name)}</td>
                      <td>${escapeHtml(entry.whatsappId)}</td>
                      <td>${escapeHtml(entry.lastMessage)}</td>
                      <td>${escapeHtml(entry.reason)}</td>
                      <td>${escapeHtml(entry.createdAt)}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </div>
  </div>
</body>
</html>`;
}

function createDashboardApp({ config, whatsappClient, store, agent, logger = console }) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

  if (config.dashboardToken) {
    app.use((req, res, next) => {
      const token = req.query.token || req.headers['x-dashboard-token'];
      if (token !== config.dashboardToken) {
        res.status(401).send('Acesso negado. Adicione ?token=SEU_TOKEN na URL.');
        return;
      }
      next();
    });
  }

  app.get('/', (req, res) => {
    res.type('html').send(
      renderPage({
        config,
        whatsappClient,
        store,
        notice: req.query.notice,
        error: req.query.error,
      })
    );
  });

  app.get('/qr.png', async (req, res) => {
    const qr = whatsappClient.getLastQr();
    if (!qr) {
      res.status(404).send('QR code não disponível no momento.');
      return;
    }
    try {
      const buffer = await QRCode.toBuffer(qr, { width: 320, margin: 1 });
      res.type('png').send(buffer);
    } catch (err) {
      res.status(500).send('Não foi possível gerar a imagem do QR code.');
    }
  });

  app.post('/contacts', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.redirect('/?error=' + encodeURIComponent('Selecione um arquivo CSV antes de enviar.'));
      return;
    }

    const raw = req.file.buffer.toString('utf8');
    let contacts;
    try {
      contacts = parseContactsCsv(raw, { defaultCountryCode: config.defaultCountryCode });
    } catch (err) {
      res.redirect('/?error=' + encodeURIComponent('Não consegui ler esse CSV: ' + err.message));
      return;
    }

    if (contacts.length === 0) {
      res.redirect(
        '/?error=' +
          encodeURIComponent('O arquivo não tem nenhum contato válido. Confira se as colunas são name, phone, consent.')
      );
      return;
    }

    const absolutePath = path.resolve(config.contactsFile);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, raw);

    const authorized = contacts.filter((c) => c.consent).length;
    logger.log(`Planilha de contatos atualizada via painel: ${contacts.length} lidos, ${authorized} autorizados.`);
    res.redirect(
      '/?notice=' + encodeURIComponent(`Planilha salva: ${contacts.length} contato(s) lidos, ${authorized} autorizado(s).`)
    );
  });

  app.post('/campaign/run', express.urlencoded({ extended: false }), (req, res) => {
    if (whatsappClient.getState() !== 'ready') {
      res.redirect('/?error=' + encodeURIComponent('O WhatsApp ainda não está conectado. Escaneie o QR code primeiro.'));
      return;
    }
    agent
      .runCampaign()
      .catch((err) => logger.error('Erro ao rodar a campanha pelo painel:', err));
    res.redirect('/?notice=' + encodeURIComponent('Envio iniciado para os contatos novos. Acompanhe pelos logs do processo.'));
  });

  return app;
}

module.exports = { createDashboardApp };
