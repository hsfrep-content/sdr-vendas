const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { toWhatsAppId } = require('../phone');

const TRUE_VALUES = new Set(['sim', 'true', '1', 'yes', 'y']);

function isConsentGiven(value) {
  return TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

// Carrega todos os contatos do CSV (colunas aceitas em pt-BR ou en-US), sem filtrar consentimento.
function loadContacts(filePath, { defaultCountryCode = '55' } = {}) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  return records
    .map((row) => ({
      name: (row.name || row.nome || '').trim(),
      phone: row.phone || row.telefone || row.numero || '',
      consent: isConsentGiven(row.consent ?? row.consentimento ?? row.autorizado),
    }))
    .filter((contact) => contact.name && contact.phone)
    .map((contact) => ({ ...contact, whatsappId: toWhatsAppId(contact.phone, defaultCountryCode) }))
    .filter((contact) => contact.whatsappId);
}

// Somente os contatos que autorizaram previamente o contato (opt-in explícito na planilha).
function loadAuthorizedContacts(filePath, options) {
  return loadContacts(filePath, options).filter((contact) => contact.consent);
}

module.exports = { loadContacts, loadAuthorizedContacts, isConsentGiven };
