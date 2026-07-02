const fs = require('fs');
const path = require('path');

function appendToQueue(queueFilePath, entry) {
  const absolutePath = path.resolve(queueFilePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  let queue = [];
  try {
    queue = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  queue.push(entry);
  fs.writeFileSync(absolutePath, JSON.stringify(queue, null, 2));
  return entry;
}

// Interrompe o fluxo automático e registra o lead para um atendente humano assumir a conversa.
// `queueFile` grava um registro em disco; `notify` (opcional) pode avisar um time em tempo real
// (ex: enviar mensagem para um número/grupo interno de WhatsApp).
async function triggerHumanHandoff({ contact, message, reason }, { queueFile, notify } = {}) {
  const entry = {
    name: contact.name,
    whatsappId: contact.whatsappId,
    lastMessage: message,
    reason,
    createdAt: new Date().toISOString(),
  };

  if (queueFile) appendToQueue(queueFile, entry);
  if (typeof notify === 'function') await notify(entry);

  return entry;
}

module.exports = { triggerHumanHandoff, appendToQueue };
