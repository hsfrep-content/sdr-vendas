// Testes das peças determinísticas: score, classificação, compliance,
// antiplágio, slug e parser RSS.

const { test } = require('node:test');
const assert = require('node:assert');

const { pontuarNoticia, classificarTemas, temDadoObjetivo } = require('../src/agents/agente1-coletor');
const { validarPost, verificarPlagio, decidirStatus } = require('../src/compliance');
const { slugificar, truncar, normalizar } = require('../src/lib/texto');
const { parseFeed } = require('../src/lib/rss');

const FONTE = { autoridade: 90 };

test('score alto para notícia de Selic recente com dado objetivo', () => {
  const noticia = {
    titulo: 'Copom mantém Selic em 15% ao ano e sinaliza cautela com inflação',
    resumo: 'Decisão afeta o crédito imobiliário e o financiamento de imóveis. IPCA segue acima da meta.',
    data: new Date(),
  };
  const { score } = pontuarNoticia(noticia, FONTE);
  assert.ok(score > 75, `esperava score > 75, obtive ${score}`);
});

test('score baixo para notícia sem relação com o boletim', () => {
  const noticia = {
    titulo: 'Time de futebol anuncia novo treinador',
    resumo: 'Contratação foi celebrada pela torcida.',
    data: new Date(Date.now() - 72 * 36e5),
  };
  const { score } = pontuarNoticia(noticia, { autoridade: 40 });
  assert.ok(score < 40, `esperava score < 40, obtive ${score}`);
});

test('classificação de temas encontra selic e crédito imobiliário', () => {
  const temas = classificarTemas(normalizar('Copom decide sobre a Selic; financiamento imobiliário fica mais caro'));
  assert.ok(temas.includes('selic'));
  assert.ok(temas.includes('credito-imobiliario'));
});

test('detecção de dado objetivo', () => {
  assert.ok(temDadoObjetivo('IPCA sobe 0,42% em junho', ''));
  assert.ok(temDadoObjetivo('Imóvel médio custa R$ 9.500 o metro quadrado', ''));
  assert.ok(!temDadoObjetivo('Mercado segue atento aos próximos passos', 'sem números'));
});

test('compliance bloqueia frase proibida e texto longo', () => {
  const post = {
    tituloEditorial: 'Título',
    textoFinal: 'x'.repeat(1600),
    leituraAEL: 'Não perca essa oportunidade de comprar.',
    fontes: ['Banco Central'],
    slug: 'titulo-valido',
    metaDescription: 'ok',
    categoria: 'Economia',
  };
  const { ok, problemas } = validarPost(post);
  assert.ok(!ok);
  assert.ok(problemas.some((p) => p.includes('1500')));
  assert.ok(problemas.some((p) => p.includes('frase proibida')));
});

test('compliance aprova post correto', () => {
  const post = {
    tituloEditorial: 'Juros e imóveis: o que observar',
    textoFinal: 'O cenário merece acompanhamento. O impacto depende de crédito, renda e preço.',
    leituraAEL: 'Imóveis bem localizados tendem a preservar maior liquidez.',
    fontes: ['Banco Central', 'InfoMoney'],
    slug: '2026-07-07-juros-e-imoveis',
    metaDescription: 'Leitura da A&L sobre juros e mercado imobiliário.',
    categoria: 'Selic e Juros',
  };
  const { ok, problemas } = validarPost(post);
  assert.ok(ok, `problemas: ${problemas.join('; ')}`);
});

test('antiplágio detecta cópia literal longa', () => {
  const original =
    'O Comitê de Política Monetária do Banco Central decidiu nesta quarta-feira manter a taxa básica de juros em quinze por cento ao ano, citando a persistência da inflação de serviços.';
  const copia = `Segundo a imprensa, ${original} A leitura merece atenção.`;
  assert.ok(!verificarPlagio(copia, [original]).ok);
  assert.ok(verificarPlagio('Texto totalmente reescrito, sem trechos literais da matéria.', [original]).ok);
});

test('política de status pelo score', () => {
  const base = { complianceOk: true, autoPublish: true, modoIA: true };
  assert.equal(decidirStatus({ ...base, score: 80 }), 'Publicar');
  assert.equal(decidirStatus({ ...base, score: 70 }), 'Rascunho');
  assert.equal(decidirStatus({ ...base, score: 50 }), 'Não publicar');
  assert.equal(decidirStatus({ ...base, score: 80, autoPublish: false }), 'Revisar');
  assert.equal(decidirStatus({ ...base, score: 80, complianceOk: false }), 'Revisar');
  assert.equal(decidirStatus({ ...base, score: 80, modoIA: false }), 'Revisar');
});

test('slug SEO', () => {
  assert.equal(slugificar('Selic a 15%: o que muda no crédito imobiliário?'), 'selic-a-15-o-que-muda-no-credito-imobiliario');
});

test('truncar respeita limite', () => {
  assert.ok(truncar('palavra '.repeat(50), 100).length <= 100);
});

test('parser RSS extrai itens', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Selic mantida em 15%]]></title>
    <link>https://exemplo.com/selic</link>
    <pubDate>Mon, 06 Jul 2026 10:00:00 GMT</pubDate>
    <description>O Copom manteve a taxa.</description></item>
  </channel></rss>`;
  const itens = parseFeed(xml);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].titulo, 'Selic mantida em 15%');
  assert.equal(itens[0].link, 'https://exemplo.com/selic');
  assert.ok(itens[0].data instanceof Date);
});
