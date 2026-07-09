'use strict';

// Persistência do Imóvel IA: inventário de imóveis, leads e estatísticas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.IMOVEL_IA_DATA_DIR || path.join(__dirname, '..', 'data', 'imovel-ia');
const INVENTORY_FILE = path.join(DATA_DIR, 'imoveis.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Não foi possível ler ${file}: ${err.message}`);
  }
}

function writeJson(file, data) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// ---------- Inventário ----------
function loadInventory() {
  return readJson(INVENTORY_FILE, { atualizadoEm: null, origem: null, imoveis: [] });
}

function saveInventory(imoveis, origem) {
  const data = { atualizadoEm: new Date().toISOString(), origem, imoveis };
  writeJson(INVENTORY_FILE, data);
  return data;
}

// ---------- Leads ----------
function loadLeads() {
  return readJson(LEADS_FILE, []);
}

function addLead(lead) {
  const leads = loadLeads();
  const entry = { id: `lead_${crypto.randomBytes(5).toString('hex')}`, criadoEm: new Date().toISOString(), ...lead };
  leads.push(entry);
  writeJson(LEADS_FILE, leads);
  return entry;
}

// ---------- Estatísticas simples ----------
function bumpStat(key) {
  const stats = readJson(STATS_FILE, {});
  const dia = new Date().toISOString().slice(0, 10);
  stats[dia] = stats[dia] || {};
  stats[dia][key] = (stats[dia][key] || 0) + 1;
  writeJson(STATS_FILE, stats);
}

function loadStats() {
  return readJson(STATS_FILE, {});
}

module.exports = { DATA_DIR, loadInventory, saveInventory, loadLeads, addLead, bumpStat, loadStats };
