// Logs de coleta, seleção, publicação e rejeição em JSONL (um arquivo por dia).

const fs = require('fs');
const path = require('path');
const { dataISOBrasilia } = require('./texto');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function log(evento, dados = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const linha = JSON.stringify({ ts: new Date().toISOString(), evento, ...dados });
  fs.appendFileSync(path.join(LOG_DIR, `${dataISOBrasilia()}.jsonl`), linha + '\n');
  const resumo = dados.msg || dados.fonte || dados.id || '';
  console.log(`[${evento}] ${resumo}`);
}

module.exports = { log, LOG_DIR };
