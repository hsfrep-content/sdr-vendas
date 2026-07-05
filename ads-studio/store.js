'use strict';

// Persistência simples em JSON (mesmo padrão do restante do projeto: sem banco externo).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.ADS_DATA_DIR || path.join(__dirname, '..', 'data', 'ads-studio');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const DEFAULT_DB = {
  settings: {
    empresa: 'A&L Negócios Imobiliários',
    cidadeBase: '',
    raioKm: 30,
    produtoMediaAlta: '',
    produtoEconomico: '',
    verbaGoogle: 1100,
    verbaMetaDiaria: '',
    observacoes: '',
  },
  products: [],   // { id, nome, tipo: 'media-alta'|'economico'|'captacao'|'litoral', descricao, cidade, precoDe, precoAte, diferenciais, images: [{id, filename, originalName, label}] }
  creatives: [],  // { id, productId, categoria, formato: 'estatico'|'video', titulo, textoPrimario, headline, descricao, roteiro, cta, status: 'rascunho'|'testando'|'aprovado'|'pausado', origem: 'ia'|'manual', criadoEm }
  campaigns: [],  // { id, nome, categoria, plataforma: 'meta'|'google', objetivo, orcamentoDiario, status, produtoId, notas, checklist: [{item, feito}], criadoEm }
  chats: {},      // { [agentId]: [{role, content, ts}] } — histórico curto por agente
};

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) return structuredClone(DEFAULT_DB);
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Garante chaves novas em bancos antigos.
    return { ...structuredClone(DEFAULT_DB), ...db, settings: { ...DEFAULT_DB.settings, ...(db.settings || {}) } };
  } catch (err) {
    throw new Error(`Não foi possível ler ${DB_FILE}: ${err.message}`);
  }
}

function save(db) {
  ensureDirs();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { load, save, newId, DATA_DIR, UPLOADS_DIR };
