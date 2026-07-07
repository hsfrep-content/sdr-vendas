// Compliance editorial: validações aplicadas a todo post antes de receber
// status. Um post que falhe em qualquer regra "dura" é rebaixado para
// "Revisar" (nunca publicado automaticamente).

const { normalizar } = require('./lib/texto');

// Frases proibidas (promessa de resultado, apelo comercial, sensacionalismo).
const FRASES_PROIBIDAS = [
  'compre agora',
  'nao perca essa oportunidade',
  'nao perca esta oportunidade',
  'vai valorizar',
  'e garantia de ganho',
  'garantia de ganho',
  'o melhor investimento',
  'lucro garantido',
  'retorno garantido',
  'imperdivel',
  'corra',
  'ultima chance',
  'oportunidade unica',
  'recomendamos comprar',
  'recomendamos vender',
  'hora de comprar',
  'hora de vender',
];

const LIMITE_TEXTO = 1500;
const LIMITE_META = 155;

/**
 * @returns {{ok: boolean, problemas: string[]}}
 */
function validarPost(post) {
  const problemas = [];
  const textoCompleto = normalizar(
    `${post.tituloEditorial} ${post.textoFinal} ${post.leituraAEL} ${post.metaDescription}`
  );

  if (!post.tituloEditorial) problemas.push('sem título editorial');
  if (!post.textoFinal) problemas.push('sem texto principal');
  if ((post.textoFinal || '').length > LIMITE_TEXTO)
    problemas.push(`texto principal excede ${LIMITE_TEXTO} caracteres (${post.textoFinal.length})`);
  if (!post.leituraAEL) problemas.push('sem bloco "Leitura A&L"');
  if (!post.fontes || post.fontes.length === 0) problemas.push('sem fontes citadas');
  if (!post.slug || !/^[a-z0-9-]+$/.test(post.slug)) problemas.push('slug ausente ou inválido');
  if (!post.metaDescription) problemas.push('sem meta description');
  if ((post.metaDescription || '').length > LIMITE_META)
    problemas.push(`meta description excede ${LIMITE_META} caracteres`);
  if (!post.categoria) problemas.push('sem categoria');

  for (const frase of FRASES_PROIBIDAS) {
    if (textoCompleto.includes(frase)) problemas.push(`frase proibida: "${frase}"`);
  }

  return { ok: problemas.length === 0, problemas };
}

// Proteção contra plágio: nenhum trecho longo do resumo/título original pode
// aparecer literalmente no texto final (citação máxima de ~90 caracteres).
function verificarPlagio(textoFinal, materiaisOriginais, janela = 90) {
  const alvo = normalizar(textoFinal);
  for (const original of materiaisOriginais) {
    const fonte = normalizar(original || '');
    if (fonte.length < janela) continue;
    for (let i = 0; i + janela <= fonte.length; i += 30) {
      const trecho = fonte.slice(i, i + janela);
      if (alvo.includes(trecho)) {
        return { ok: false, trecho };
      }
    }
  }
  return { ok: true };
}

// Decisão de status pelo score, conforme a política:
//   > 75 => Publicar (se autoPublish e compliance ok)
//   60-75 => Rascunho
//   < 60 => Não publicar (registro interno)
function decidirStatus({ score, complianceOk, autoPublish, modoIA }) {
  if (!complianceOk) return 'Revisar';
  if (!modoIA) return 'Revisar'; // conteúdo heurístico nunca publica sozinho
  if (score > 75) return autoPublish ? 'Publicar' : 'Revisar';
  if (score >= 60) return 'Rascunho';
  return 'Não publicar';
}

module.exports = { validarPost, verificarPlagio, decidirStatus, FRASES_PROIBIDAS, LIMITE_TEXTO, LIMITE_META };
