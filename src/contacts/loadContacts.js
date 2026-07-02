const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { toWhatsAppId } = require('../phone');

const TRUE_VALUES = new Set(['sim', 'true', '1', 'yes', 'y']);

function isConsentGiven(value) {
  return TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

// Interpreta o texto de um CSV de contatos (colunas aceitas em pt-BR ou en-US), sem filtrar
// consentimento. Separado de loadContacts para poder validar um upload em memória antes de
// gravar em disco (ver src/web/server.js).
function parseContactsCsv(raw, { defaultCountryCode = '55' } = {}) {
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

function loadContacts(filePath, options) {
  const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  return parseContactsCsv(raw, options);
}

// Somente os contatos que autorizaram previamente o contato (opt-in explícito na planilha).
function loadAuthorizedContacts(filePath, options) {
  return loadContacts(filePath, options).filter((contact) => contact.consent);
}

module.exports = { loadContacts, loadAuthorizedContacts, parseContactsCsv, isConsentGiven };
