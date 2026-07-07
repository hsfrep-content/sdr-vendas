// AGENTE 2 — ANALISTA MACRO-IMOBILIÁRIO
//
// Lê a seleção ranqueada do Agente 1, cruza as informações e produz o parecer
// editorial do dia: 1 a 3 temas com impacto financeiro, impacto imobiliário,
// grau de confiança e recomendação (publicar | aguardar | descartar).

const { chamarEstruturado } = require('../lib/claude');
const { PRIORIDADE_MAXIMA, CATEGORIAS } = require('../../config/temas');
const { log } = require('../lib/logger');

const SCHEMA_PARECER = {
  type: 'object',
  additionalProperties: false,
  required: ['temas', 'observacoesGerais'],
  properties: {
    observacoesGerais: { type: 'string', description: 'Leitura geral do período em 2-3 frases.' },
    temas: {
      type: 'array',
      description: 'De 1 a 3 temas, do mais ao menos importante.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'titulo', 'oQueAconteceu', 'porQueImporta', 'impactoFinanceiro',
          'impactoImobiliario', 'impactoRegional', 'confirmadoPorFontePrimaria',
          'grauConfianca', 'recomendacao', 'categoria', 'urlsBase', 'publicos',
        ],
        properties: {
          titulo: { type: 'string' },
          oQueAconteceu: { type: 'string' },
          porQueImporta: { type: 'string' },
          impactoFinanceiro: { type: 'string', description: 'Efeito em juros, crédito, financiamento, liquidez.' },
          impactoImobiliario: { type: 'string', description: 'Efeito em preço, velocidade de venda, locação, incorporação.' },
          impactoRegional: { type: 'string', description: 'Impacto potencial para Zona Sul do Recife, Paiva, Boa Viagem, Piedade, Candeias ou Nordeste. Use "não identificado" se não houver.' },
          confirmadoPorFontePrimaria: { type: 'boolean' },
          grauConfianca: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
          recomendacao: { type: 'string', enum: ['publicar', 'aguardar', 'descartar'] },
          categoria: { type: 'string', enum: CATEGORIAS },
          urlsBase: { type: 'array', items: { type: 'string' }, description: 'URLs das notícias do Agente 1 que embasam este tema.' },
          publicos: {
            type: 'array',
            items: { type: 'string', enum: ['compradores', 'vendedores', 'proprietarios', 'investidores', 'corretores', 'incorporadoras', 'locacao'] },
          },
        },
      },
    },
  },
};

const SYSTEM_ANALISTA = `Você é o Analista Macro-Imobiliário da A&L | Negócios Imobiliários, imobiliária de posicionamento sóbrio, técnico e consultivo na Zona Sul do Recife (Pina, Boa Viagem, Setúbal, Piedade, Candeias, Paiva).

Sua função: cruzar notícias de mercado financeiro e imobiliário e transformá-las em inteligência prática. Para cada tema, responda: o que aconteceu, por que importa, como afeta juros/crédito/financiamento/preço/liquidez, qual o impacto no mercado imobiliário e se há impacto regional para Recife/Nordeste.

Regras rígidas:
- Escolha apenas 1 a 3 temas realmente importantes. Agrupe notícias sobre o mesmo assunto num único tema.
- Recomende "publicar" somente se o tema tiver ao menos uma destas características: mudança/expectativa sobre Selic; nova leitura de inflação; alteração relevante no crédito imobiliário; dados de venda, locação ou preço de imóveis; movimento em FIIs/incorporadoras com leitura setorial; notícia econômica com impacto provável sobre financiamento; tendência relevante para proprietários, compradores ou investidores; ou valor educativo para o público da A&L.
- Recomende "aguardar" quando o dado depender de confirmação por fonte primária (BCB, IBGE, FipeZAP, CBIC, ABRAINC, Secovi).
- Recomende "descartar" para opinião sem dado, conteúdo repetido, publicitário ou de baixa confiabilidade.
- Diferencie fato de interpretação. Nunca invente dados. Não faça recomendação de investimento nem prometa valorização.
- Grau de confiança "alto" exige fonte primária ou mais de uma fonte independente convergente.`;

// Fallback heurístico usado quando não há ANTHROPIC_API_KEY.
function analisarHeuristico(ranqueadas) {
  const temas = [];
  const usadas = new Set();
  const ordenadas = [...ranqueadas].sort((a, b) => {
    const pa = a.temas.some((t) => PRIORIDADE_MAXIMA.includes(t)) ? 1 : 0;
    const pb = b.temas.some((t) => PRIORIDADE_MAXIMA.includes(t)) ? 1 : 0;
    return pb - pa || b.nota - a.nota;
  });
  for (const n of ordenadas) {
    if (temas.length >= 3) break;
    const chave = n.temas[0] || 'geral';
    if (usadas.has(chave)) continue;
    usadas.add(chave);
    temas.push({
      titulo: n.titulo,
      oQueAconteceu: n.resumo,
      porQueImporta: 'Tema com relação direta com juros, crédito, inflação ou imóveis, segundo o score de coleta.',
      impactoFinanceiro: 'A confirmar em revisão humana.',
      impactoImobiliario: 'A confirmar em revisão humana.',
      impactoRegional: 'não identificado',
      confirmadoPorFontePrimaria: ['bcb-noticias', 'ibge-agencia'].includes(n.fonteId),
      grauConfianca: 'baixo',
      recomendacao: n.nota > 75 ? 'publicar' : n.nota >= 60 ? 'aguardar' : 'descartar',
      categoria: 'Economia',
      urlsBase: [n.link],
      publicos: ['compradores', 'investidores'],
    });
  }
  return { observacoesGerais: 'Parecer gerado em modo heurístico (sem IA); requer revisão humana.', temas };
}

/**
 * @param {object[]} ranqueadas saída do Agente 1
 * @param {{rodada: string, data: string}} contexto
 */
async function analisar(ranqueadas, contexto) {
  if (ranqueadas.length === 0) {
    return { observacoesGerais: 'Nenhuma notícia relevante no período; apenas registro interno.', temas: [], modo: 'vazio' };
  }

  const user = [
    `Rodada: ${contexto.rodada === 'manha' ? 'manhã (08h00, Brasília)' : 'fechamento do dia (22h00, Brasília)'} — ${contexto.data}.`,
    contexto.rodada === 'noite'
      ? 'Esta é a rodada de fechamento: priorize a leitura consolidada do dia.'
      : 'Esta é a nota matinal: priorize o que foi publicado na madrugada/manhã e indicadores recém-divulgados.',
    '',
    'Notícias ranqueadas pelo Agente 1 (fonte, nota 0-100, temas, resumo):',
    JSON.stringify(
      ranqueadas.map((n) => ({
        titulo: n.titulo, fonte: n.fonte, url: n.link, data: n.data,
        nota: n.nota, temas: n.temas, resumo: n.resumo, paywall: n.paywall,
      })),
      null,
      2
    ),
    '',
    'Produza o parecer editorial no formato estruturado exigido.',
  ].join('\n');

  try {
    const parecer = await chamarEstruturado({
      system: SYSTEM_ANALISTA,
      user,
      schema: SCHEMA_PARECER,
      maxTokens: 8000,
    });
    if (parecer) {
      log('agente2.ok', { msg: `${parecer.temas.length} tema(s), modo IA` });
      return { ...parecer, modo: 'ia' };
    }
  } catch (e) {
    log('agente2.erro', { msg: String(e.message || e) });
  }

  const parecer = analisarHeuristico(ranqueadas);
  log('agente2.fallback', { msg: `${parecer.temas.length} tema(s), modo heurístico` });
  return { ...parecer, modo: 'heuristico' };
}

module.exports = { analisar, analisarHeuristico, SCHEMA_PARECER };
