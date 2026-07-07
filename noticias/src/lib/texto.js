// Utilidades de texto: normalização, slug, datas em horário de Brasília.

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugificar(s, maxLen = 80) {
  return normalizar(s)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, maxLen)
    .replace(/-$/, '');
}

const TZ = 'America/Sao_Paulo';

function agoraBrasilia() {
  return new Date();
}

function formatarDataHoraBR(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dataISOBrasilia(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function horaBrasilia(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(date)
  );
}

// Rodada padrão inferida pelo relógio: 04h-15h => manhã; caso contrário, noite.
function rodadaPadrao(date = new Date()) {
  const h = horaBrasilia(date);
  return h >= 4 && h < 15 ? 'manha' : 'noite';
}

function truncar(s, max) {
  s = String(s || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

module.exports = {
  normalizar,
  slugificar,
  formatarDataHoraBR,
  dataISOBrasilia,
  horaBrasilia,
  rodadaPadrao,
  truncar,
  agoraBrasilia,
  TZ,
};
