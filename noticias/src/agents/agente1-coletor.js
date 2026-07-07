// AGENTE 1 — COLETOR DE MERCADO E FONTES
//
// Determinístico (sem LLM): varre as fontes, extrai metadados, deduplica,
// classifica por tema e pontua cada notícia de 0 a 100 pelo modelo de score
// oficial. Entrega a lista ranqueada com as 10 mais relevantes do período.
//
// Modelo de score (pesos):
//   25% impacto em juros, crédito ou inflação
//   20% impacto no mercado imobiliário
//   15% autoridade da fonte
//   15% recência
//   10% relação com comprador, vendedor ou investidor
//   10% presença de dado objetivo
//    5% relação regional (Recife, PE, NE, capitais)

const { FONTES, INDICADORES_BCB, FOCUS_URL } = require('../../config/fontes');
const { TEMAS } = require('../../config/temas');
const { fetchTexto, fetchJson } = require('../lib/http');
const { parseFeed } = require('../lib/rss');
const { normalizar, truncar } = require('../lib/texto');
const { log } = require('../lib/logger');

const CHAVES_MACRO = [
  'selic', 'copom', 'juros', 'inflacao', 'ipca', 'inpc', 'igp-m', 'focus',
  'credito', 'financiamento', 'poupanca', 'fgts', 'sbpe', 'taxa',
];
const CHAVES_IMOB = [
  'imovel', 'imoveis', 'imobiliario', 'imobiliaria', 'aluguel', 'locacao',
  'incorporadora', 'construcao', 'fii', 'fundos imobiliarios', 'mcmv',
  'minha casa', 'fipezap', 'cbic', 'abrainc', 'secovi', 'metro quadrado',
  'apartamento', 'lancamento', 'habitacao',
];
const CHAVES_PUBLICO = [
  'comprador', 'vendedor', 'proprietario', 'investidor', 'inquilino',
  'financiamento', 'parcela', 'entrada', 'compra', 'venda', 'aluguel', 'renda',
];
const CHAVES_REGIONAL = [
  'recife', 'pernambuco', 'nordeste', 'boa viagem', 'pina', 'setubal',
  'piedade', 'candeias', 'paiva', 'capitais', 'sao paulo', 'jaboatao',
];

function contarOcorrencias(texto, chaves) {
  let n = 0;
  for (const c of chaves) if (texto.includes(c)) n++;
  return n;
}

function classificarTemas(texto) {
  const encontrados = [];
  for (const tema of TEMAS) {
    if (tema.chaves.some((c) => texto.includes(normalizar(c)))) encontrados.push(tema.id);
  }
  return encontrados;
}

function temDadoObjetivo(titulo, resumo) {
  // Percentuais, valores em R$, ou números com contexto de variação.
  return /(\d+[.,]\d+\s*%|\d+\s*%|r\$\s*[\d.,]+|\balta de\b|\bqueda de\b|\bavanc\w+ \d|\brecuo\w* \d)/i.test(
    `${titulo} ${resumo}`
  );
}

function pontuarNoticia(noticia, fonte, agora = new Date()) {
  const texto = normalizar(`${noticia.titulo} ${noticia.resumo}`);

  const macro = Math.min(100, contarOcorrencias(texto, CHAVES_MACRO) * 30);
  const imob = Math.min(100, contarOcorrencias(texto, CHAVES_IMOB) * 30);
  const autoridade = fonte.autoridade;

  let recencia = 40; // sem data => neutro-baixo
  if (noticia.data) {
    const horas = (agora - noticia.data) / 36e5;
    recencia = horas <= 6 ? 100 : horas <= 12 ? 85 : horas <= 24 ? 70 : horas <= 48 ? 45 : 20;
  }

  const publico = Math.min(100, contarOcorrencias(texto, CHAVES_PUBLICO) * 35);
  const dado = temDadoObjetivo(noticia.titulo, noticia.resumo) ? 100 : 0;
  const regional = Math.min(100, contarOcorrencias(texto, CHAVES_REGIONAL) * 50);

  const score =
    0.25 * macro +
    0.2 * imob +
    0.15 * autoridade +
    0.15 * recencia +
    0.1 * publico +
    0.1 * dado +
    0.05 * regional;

  return {
    score: Math.round(score),
    componentes: { macro, imob, autoridade, recencia, publico, dado, regional },
  };
}

function motivoSelecao(componentes, temas) {
  const razoes = [];
  if (componentes.macro >= 60) razoes.push('forte relação com juros/crédito/inflação');
  if (componentes.imob >= 60) razoes.push('impacto direto no mercado imobiliário');
  if (componentes.autoridade >= 90) razoes.push('fonte de alta autoridade');
  if (componentes.recencia >= 85) razoes.push('notícia recente');
  if (componentes.dado === 100) razoes.push('traz dado objetivo');
  if (componentes.regional >= 50) razoes.push('relevância regional (Recife/PE/NE)');
  if (razoes.length === 0) razoes.push(`tema monitorado: ${temas.join(', ') || 'economia geral'}`);
  return razoes.join('; ');
}

function dedup(noticias) {
  const vistos = new Set();
  const saida = [];
  for (const n of noticias) {
    const chaveUrl = n.link.replace(/[?#].*$/, '');
    const chaveTitulo = normalizar(n.titulo).replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (vistos.has(chaveUrl) || vistos.has(chaveTitulo)) continue;
    vistos.add(chaveUrl);
    vistos.add(chaveTitulo);
    saida.push(n);
  }
  return saida;
}

async function coletarFonte(fonte, desde) {
  const urls = [fonte.url, fonte.fallback].filter(Boolean);
  for (const url of urls) {
    try {
      const xml = await fetchTexto(url);
      const itens = parseFeed(xml)
        .filter((n) => !n.data || n.data >= desde)
        .map((n) => ({ ...n, fonteId: fonte.id, fonteNome: fonte.nome, paywall: !!fonte.paywall }));
      log('coleta.fonte.ok', { fonte: fonte.id, itens: itens.length, url });
      return itens;
    } catch (e) {
      log('coleta.fonte.erro', { fonte: fonte.id, url, msg: String(e.message || e) });
    }
  }
  return [];
}

/**
 * Executa a varredura completa.
 * @param {{janelaHoras?: number, urlsExcluidas?: Set<string>}} opts
 * @returns {Promise<{ranqueadas: object[], todas: object[], descartadas: object[], fontesConsultadas: string[]}>}
 */
async function coletar({ janelaHoras = 16, urlsExcluidas = new Set() } = {}) {
  const agora = new Date();
  const desde = new Date(agora - janelaHoras * 36e5);
  const fontesConsultadas = [];
  let todas = [];

  const resultados = await Promise.all(
    FONTES.map(async (fonte) => {
      fontesConsultadas.push(fonte.nome);
      return coletarFonte(fonte, desde);
    })
  );
  for (const lista of resultados) todas = todas.concat(lista);

  todas = dedup(todas).filter((n) => !urlsExcluidas.has(n.link));

  const avaliadas = todas.map((n) => {
    const fonte = FONTES.find((f) => f.id === n.fonteId);
    const texto = normalizar(`${n.titulo} ${n.resumo}`);
    const temas = classificarTemas(texto);
    const { score, componentes } = pontuarNoticia(n, fonte, agora);
    return {
      fonte: n.fonteNome,
      fonteId: n.fonteId,
      link: n.link,
      data: n.data ? n.data.toISOString() : null,
      titulo: n.titulo,
      autor: n.autor || null,
      paywall: n.paywall,
      temas,
      resumo: truncar(n.resumo || n.titulo, 400),
      nota: score,
      componentes,
      motivo: motivoSelecao(componentes, temas),
    };
  });

  avaliadas.sort((a, b) => b.nota - a.nota);
  const ranqueadas = avaliadas.slice(0, 10);
  const descartadas = avaliadas.slice(10).map((n) => ({
    titulo: n.titulo,
    fonte: n.fonte,
    url: n.link,
    nota: n.nota,
    motivo: n.nota < 30 ? 'baixa relação com juros, crédito, inflação ou imóveis' : 'fora do top 10 da rodada',
  }));

  log('coleta.resumo', {
    msg: `coletadas=${todas.length} ranqueadas=${ranqueadas.length} descartadas=${descartadas.length}`,
  });

  return { ranqueadas, todas: avaliadas, descartadas, fontesConsultadas };
}

// Indicadores oficiais (BCB SGS + Focus) para a página /indicadores.
async function coletarIndicadores() {
  const itens = [];
  for (const ind of INDICADORES_BCB) {
    try {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${ind.serie}/dados/ultimos/1?formato=json`;
      const [dado] = await fetchJson(url);
      itens.push({ id: ind.id, nome: ind.nome, valor: dado.valor, data: dado.data });
    } catch (e) {
      log('indicadores.erro', { id: ind.id, msg: String(e.message || e) });
    }
  }
  let focus = [];
  try {
    const json = await fetchJson(FOCUS_URL);
    const porChave = new Map();
    for (const row of json.value || []) {
      const chave = `${row.Indicador}-${row.DataReferencia}`;
      if (!porChave.has(chave) && row.baseCalculo === 0) {
        porChave.set(chave, {
          indicador: row.Indicador,
          referencia: row.DataReferencia,
          mediana: row.Mediana,
          data: row.Data,
        });
      }
    }
    focus = [...porChave.values()].slice(0, 8);
  } catch (e) {
    log('indicadores.focus.erro', { msg: String(e.message || e) });
  }
  return { atualizadoEm: new Date().toISOString(), itens, focus };
}

module.exports = { coletar, coletarIndicadores, pontuarNoticia, classificarTemas, temDadoObjetivo };
