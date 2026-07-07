// AGENTE 3 — EDITOR, SEO E PUBLICADOR A&L
//
// Transforma o parecer do Agente 2 em posts curtos (até 1.500 caracteres),
// com bloco "Leitura A&L", fontes, tags, slug, meta description e status.
// Todo post passa pelo compliance (frases proibidas, limite de caracteres,
// citação de fontes, antiplágio) antes de receber status final.

const { chamarEstruturado } = require('../lib/claude');
const { CATEGORIAS } = require('../../config/temas');
const { validarPost, verificarPlagio, decidirStatus } = require('../compliance');
const { slugificar, truncar } = require('../lib/texto');
const { criarPost, registrarAlteracao } = require('../db');
const { log } = require('../lib/logger');

const SCHEMA_POSTS = {
  type: 'object',
  additionalProperties: false,
  required: ['posts'],
  properties: {
    posts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'categoria', 'texto', 'leituraAEL', 'fontes', 'tags', 'slug', 'metaDescription'],
        properties: {
          titulo: { type: 'string', description: 'Título curto, sóbrio, sem sensacionalismo.' },
          categoria: { type: 'string', enum: CATEGORIAS },
          texto: { type: 'string', description: 'Texto principal, máximo 1500 caracteres, informativo e analítico.' },
          leituraAEL: { type: 'string', description: 'Bloco "Leitura A&L": interpretação prática para compradores, vendedores, proprietários e investidores. 300-600 caracteres.' },
          fontes: { type: 'array', items: { type: 'string' }, description: 'Nomes das fontes consultadas (ex.: Banco Central, InfoMoney).' },
          tags: { type: 'array', items: { type: 'string' } },
          slug: { type: 'string', description: 'Slug SEO em minúsculas com hífens.' },
          metaDescription: { type: 'string', description: 'Máximo 155 caracteres.' },
        },
      },
    },
  },
};

const SYSTEM_EDITOR = `Você é o Editor do boletim de inteligência imobiliária da A&L | Negócios Imobiliários (noticias.aelimoveis.com.br). A marca tem posicionamento sóbrio, técnico, elegante e consultivo, com atuação na Zona Sul do Recife (Pina, Boa Viagem, Setúbal, Piedade, Candeias, Paiva).

Estilo obrigatório:
- Texto objetivo, sofisticado e claro. Informativo, nunca promocional.
- Máximo de 1.500 caracteres no texto principal.
- Sempre diferencie fato de interpretação e sinalize projeções como projeções.
- Nunca copie frases das matérias originais: reescreva com suas palavras.
- Cite as fontes pelo nome (a URL fica nos metadados).
- Proibido: "compre agora", "não perca essa oportunidade", "vai valorizar", "é garantia de ganho", "o melhor investimento", qualquer recomendação de investimento ou promessa de valorização.
- Prefira formulações sóbrias: "o cenário merece acompanhamento", "a leitura favorece uma análise mais criteriosa", "imóveis bem localizados tendem a preservar maior liquidez", "o impacto depende de crédito, renda, preço e momento de negociação", "a decisão deve considerar o perfil financeiro do comprador e a qualidade do ativo".
- O bloco "Leitura A&L" traduz o tema em consequência prática para compradores, vendedores, proprietários e investidores — sem aconselhamento financeiro, jurídico ou tributário.

Modelo de referência:
Título: "Juros, inflação e imóveis: o que observar hoje"
Texto: contexto do movimento + por que importa para custo de financiamento, capacidade de compra e velocidade de decisão.
Leitura A&L: "Quando os juros permanecem elevados, o comprador tende a ser mais seletivo e o imóvel bem precificado ganha vantagem. Já em ciclos de expectativa de queda da Selic, cresce o interesse por ativos reais, especialmente imóveis bem localizados, com liquidez e documentação regular."`;

// Fallback heurístico: gera rascunho simples a partir do parecer (sem IA).
function redigirHeuristico(tema) {
  const texto = truncar(
    `${tema.oQueAconteceu} ${tema.porQueImporta} Para o mercado imobiliário, o ponto de atenção é o efeito sobre crédito, financiamento e ritmo de decisão de compra e venda. O cenário merece acompanhamento.`,
    1400
  );
  return {
    titulo: truncar(tema.titulo, 90),
    categoria: tema.categoria,
    texto,
    leituraAEL:
      'A leitura favorece uma análise mais criteriosa: o impacto depende de crédito, renda, preço e momento de negociação. Imóveis bem localizados tendem a preservar maior liquidez em qualquer cenário.',
    fontes: ['Coleta automática — ver links nos metadados'],
    tags: tema.publicos || [],
    slug: slugificar(tema.titulo),
    metaDescription: truncar(tema.oQueAconteceu, 150),
  };
}

/**
 * @param {object} parecer saída do Agente 2
 * @param {object[]} ranqueadas saída do Agente 1 (para antiplágio e URLs)
 * @param {{rodada: string, data: string, autoPublish: boolean, maxPosts: number}} ctx
 * @returns {Promise<object[]>} posts prontos (esquema do banco)
 */
async function editar(parecer, ranqueadas, ctx) {
  const temasPublicaveis = parecer.temas
    .filter((t) => t.recomendacao === 'publicar')
    .slice(0, ctx.maxPosts);
  if (temasPublicaveis.length === 0) return [];

  let rascunhos = null;
  const modoIA = parecer.modo === 'ia';

  if (modoIA) {
    const user = [
      `Rodada: ${ctx.rodada === 'manha' ? 'manhã (08h00)' : 'fechamento (22h00)'} de ${ctx.data}, horário de Brasília.`,
      '',
      'Parecer editorial do Analista (Agente 2):',
      JSON.stringify({ observacoesGerais: parecer.observacoesGerais, temas: temasPublicaveis }, null, 2),
      '',
      `Escreva ${temasPublicaveis.length} post(s), um por tema, na ordem dada, seguindo o formato estruturado.`,
    ].join('\n');
    try {
      const saida = await chamarEstruturado({
        system: SYSTEM_EDITOR,
        user,
        schema: SCHEMA_POSTS,
        maxTokens: 12000,
      });
      rascunhos = saida && saida.posts;
    } catch (e) {
      log('agente3.erro', { msg: String(e.message || e) });
    }
  }
  if (!rascunhos) rascunhos = temasPublicaveis.map(redigirHeuristico);

  const posts = [];
  for (let i = 0; i < rascunhos.length && i < temasPublicaveis.length; i++) {
    const r = rascunhos[i];
    const tema = temasPublicaveis[i];
    const urlBase = (tema.urlsBase && tema.urlsBase[0]) || null;
    const noticiaBase = ranqueadas.find((n) => tema.urlsBase && tema.urlsBase.includes(n.link)) || ranqueadas[0];

    const post = criarPost({
      rodada: ctx.rodada,
      fonteOriginal: noticiaBase ? noticiaBase.fonte : null,
      urlOriginal: urlBase || (noticiaBase ? noticiaBase.link : null),
      tituloOriginal: noticiaBase ? noticiaBase.titulo : null,
      tituloEditorial: r.titulo,
      categoria: r.categoria,
      tags: r.tags || [],
      resumoBruto: noticiaBase ? noticiaBase.resumo : null,
      analiseAgente2: tema,
      textoFinal: r.texto,
      leituraAEL: r.leituraAEL,
      fontes: r.fontes || [],
      metaDescription: truncar(r.metaDescription || '', 155),
      slug: `${ctx.data}-${slugificar(r.slug || r.titulo)}`,
      scoreRelevancia: noticiaBase ? noticiaBase.nota : null,
      grauConfianca: tema.grauConfianca,
    });

    // Compliance + antiplágio decidem o status final.
    const validacao = validarPost(post);
    const materiais = ranqueadas.flatMap((n) => [n.titulo, n.resumo]);
    const plagio = verificarPlagio(post.textoFinal + ' ' + post.leituraAEL, materiais);
    if (!plagio.ok) validacao.problemas.push(`possível cópia literal de trecho de matéria: "${plagio.trecho.slice(0, 50)}…"`);

    post.status = decidirStatus({
      score: post.scoreRelevancia ?? 0,
      complianceOk: validacao.ok && plagio.ok,
      autoPublish: ctx.autoPublish,
      modoIA,
    });
    if (post.status === 'Publicar') post.dataPublicacao = new Date().toISOString();

    registrarAlteracao(
      post,
      'criado',
      `rodada=${ctx.rodada}; status=${post.status}; problemas=${validacao.problemas.join(' | ') || 'nenhum'}`
    );
    log('agente3.post', { id: post.id, msg: `${post.status}: ${post.tituloEditorial}` });
    posts.push(post);
  }
  return posts;
}

module.exports = { editar, redigirHeuristico, SCHEMA_POSTS };
