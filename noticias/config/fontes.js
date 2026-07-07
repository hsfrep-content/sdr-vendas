// Fontes monitoradas pelo Agente 1 — Coletor de Mercado e Fontes.
//
// Cada fonte tem:
//   id          - identificador estável usado no banco e nos logs
//   nome        - nome exibido no blog e nos relatórios
//   tipo        - "rss" | "google-news" | "api-bcb-sgs" | "api-bcb-focus"
//   autoridade  - 0 a 100, peso de autoridade da fonte no score
//   prioridade  - "primaria" | "complementar"
//
// Regras de coleta: apenas RSS oficial, APIs públicas, Google News RSS e
// páginas públicas. Nunca burlar paywall; de fontes com paywall usamos apenas
// título, chamada pública e metadados, sempre com link canônico.

function googleNews(query) {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

const FONTES = [
  // ── Bloco 1: Banco Central do Brasil (fonte primária de dados) ──────────
  {
    id: 'bcb-noticias',
    nome: 'Banco Central do Brasil',
    tipo: 'google-news',
    url: googleNews('site:bcb.gov.br OR "Banco Central" Copom OR Selic OR "Boletim Focus" when:2d'),
    autoridade: 100,
    prioridade: 'primaria',
  },

  // ── Bloco 2: IBGE ────────────────────────────────────────────────────────
  {
    id: 'ibge-agencia',
    nome: 'Agência IBGE Notícias',
    tipo: 'rss',
    url: 'https://agenciadenoticias.ibge.gov.br/agencia-noticias.html?format=feed&type=rss',
    fallback: googleNews('site:agenciadenoticias.ibge.gov.br IPCA OR INPC OR PIB OR "construção civil" when:2d'),
    autoridade: 100,
    prioridade: 'primaria',
  },

  // ── Bloco 3: InfoMoney ───────────────────────────────────────────────────
  {
    id: 'infomoney',
    nome: 'InfoMoney',
    tipo: 'rss',
    url: 'https://www.infomoney.com.br/feed/',
    fallback: googleNews('site:infomoney.com.br juros OR Selic OR inflação OR imóveis when:1d'),
    autoridade: 80,
    prioridade: 'primaria',
  },

  // ── Bloco 4: Valor Econômico (paywall — apenas título/chamada/metadados) ─
  {
    id: 'valor',
    nome: 'Valor Econômico',
    tipo: 'google-news',
    url: googleNews('site:valor.globo.com juros OR crédito OR "construção civil" OR imóveis OR Copom when:1d'),
    autoridade: 90,
    prioridade: 'primaria',
    paywall: true,
  },

  // ── Bloco 5: Money Times ─────────────────────────────────────────────────
  {
    id: 'moneytimes',
    nome: 'Money Times',
    tipo: 'rss',
    url: 'https://www.moneytimes.com.br/feed/',
    fallback: googleNews('site:moneytimes.com.br juros OR "fundos imobiliários" OR incorporadoras when:1d'),
    autoridade: 70,
    prioridade: 'primaria',
  },

  // ── Bloco 6: Brazil Journal e Metro Quadrado ─────────────────────────────
  {
    id: 'braziljournal',
    nome: 'Brazil Journal',
    tipo: 'rss',
    url: 'https://braziljournal.com/feed/',
    fallback: googleNews('site:braziljournal.com mercado OR incorporadora OR crédito when:2d'),
    autoridade: 80,
    prioridade: 'primaria',
  },
  {
    id: 'metroquadrado',
    nome: 'Metro Quadrado (Brazil Journal)',
    tipo: 'google-news',
    url: googleNews('site:braziljournal.com "metro quadrado" OR imóveis OR incorporadoras OR FII when:3d'),
    autoridade: 80,
    prioridade: 'primaria',
  },

  // ── Bloco 7: FipeZAP, CBIC, ABRAINC e Secovi ─────────────────────────────
  {
    id: 'fipezap',
    nome: 'FipeZAP',
    tipo: 'google-news',
    url: googleNews('FipeZAP preço OR aluguel OR "metro quadrado" when:7d'),
    autoridade: 95,
    prioridade: 'primaria',
  },
  {
    id: 'cbic-abrainc-secovi',
    nome: 'CBIC / ABRAINC / Secovi',
    tipo: 'google-news',
    url: googleNews('CBIC OR ABRAINC OR Secovi lançamentos OR vendas OR "construção civil" OR MCMV when:7d'),
    autoridade: 90,
    prioridade: 'primaria',
  },

  // ── Fontes complementares (validação e contexto) ─────────────────────────
  {
    id: 'agenciabrasil',
    nome: 'Agência Brasil — Economia',
    tipo: 'rss',
    url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
    fallback: googleNews('site:agenciabrasil.ebc.com.br economia when:1d'),
    autoridade: 85,
    prioridade: 'complementar',
  },
  {
    id: 'caixa-mcmv',
    nome: 'Caixa / MCMV / crédito habitacional',
    tipo: 'google-news',
    url: googleNews('"Caixa Econômica" OR "Minha Casa Minha Vida" financiamento OR habitação OR "crédito imobiliário" when:2d'),
    autoridade: 85,
    prioridade: 'complementar',
  },
  {
    id: 'recife-regional',
    nome: 'Mercado imobiliário Recife / Nordeste',
    tipo: 'google-news',
    url: googleNews('mercado imobiliário Recife OR Pernambuco OR "Boa Viagem" OR Paiva OR Nordeste when:7d'),
    autoridade: 60,
    prioridade: 'complementar',
  },
];

// APIs oficiais do Banco Central usadas para a página /indicadores
// (dados primários, não passam pelo funil de notícias).
const INDICADORES_BCB = [
  { id: 'selic-meta', nome: 'Selic (meta, % a.a.)', serie: 432 },
  { id: 'ipca-12m', nome: 'IPCA acumulado 12 meses (%)', serie: 13522 },
  { id: 'igpm-12m', nome: 'IGP-M acumulado 12 meses (%)', serie: 28655 },
  { id: 'inpc-mes', nome: 'INPC no mês (%)', serie: 188 },
];

const FOCUS_URL =
  'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/' +
  'ExpectativasMercadoAnuais?$top=40&$orderby=Data%20desc&$format=json' +
  "&$filter=Indicador%20eq%20'Selic'%20or%20Indicador%20eq%20'IPCA'";

module.exports = { FONTES, INDICADORES_BCB, FOCUS_URL, googleNews };
