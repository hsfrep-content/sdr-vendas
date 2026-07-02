const COMBINING_MARKS = /[\u0300-\u036f]/g;

function stripAccents(text) {
  return text.normalize('NFD').replace(COMBINING_MARKS, '');
}

function normalize(text) {
  return stripAccents(String(text || '').toLowerCase()).trim();
}

// Pedidos de descadastro têm prioridade sobre qualquer outra intenção detectada.
// Usa regex (em vez de substring exata) para cobrir variações de conjugação verbal,
// como "para/parar/pare de mandar" ou "manda/mande/envia/envie mais".
const OPT_OUT_REGEXES = [
  /\bpara(r)? de (mandar|enviar)\b/,
  /\bpare de (mandar|enviar)\b/,
  /\bnao (me )?(manda|mande|envia|envie)m? mais\b/,
  /\b(me\s+)?(remov|tir|retir)[a-z]*\b.*\blista\b/,
  /\bdescadastr[a-z]*\b/,
  /\bsair da lista\b/,
  /\bnao quero mais receber\b/,
  /\bstop\b/,
];

const INTEREST_PATTERNS = [
  'tenho interesse', 'quero vender', 'quero comprar', 'quero alugar',
  'quero saber mais', 'gostaria de vender', 'gostaria de comprar', 'gostaria de alugar',
  'quero sim', 'pode ser', 'com certeza', 'vamos conversar', 'pode me ligar',
  'pode me chamar', 'estou pensando em vender', 'estou pensando em comprar',
  'estou pensando em alugar', 'penso em vender', 'penso em comprar', 'penso em alugar',
  'quero mais informacoes', 'me interessa',
];

const NOT_INTERESTED_PATTERNS = [
  'nao tenho interesse', 'no momento nao', 'agora nao', 'nao obrigado',
  'nao obrigada', 'nao precis', 'nao quero', 'nao curto',
];

function matchesAny(text, patterns) {
  return patterns.find((pattern) => text.includes(pattern)) || null;
}

function matchesAnyRegex(text, regexes) {
  const match = regexes.find((regex) => regex.test(text));
  return match ? match.source : null;
}

// Classificador simples baseado em regras/palavras-chave (pt-BR) sobre a resposta do cliente.
// Retorna uma de quatro intenções: opt_out, interested, not_interested ou unclear.
function classifyIntent(rawText) {
  const text = normalize(rawText);
  if (!text) return { intent: 'unclear', matchedKeyword: null };

  const optOutMatch = matchesAnyRegex(text, OPT_OUT_REGEXES);
  if (optOutMatch) return { intent: 'opt_out', matchedKeyword: optOutMatch };

  // Verificado antes dos padrões de interesse pois negações como "não tenho interesse"
  // contêm "tenho interesse" como substring.
  const notInterestedMatch = matchesAny(text, NOT_INTERESTED_PATTERNS);
  if (notInterestedMatch) return { intent: 'not_interested', matchedKeyword: notInterestedMatch };

  const interestMatch = matchesAny(text, INTEREST_PATTERNS);
  if (interestMatch) return { intent: 'interested', matchedKeyword: interestMatch };

  if (/^(sim|s|claro|isso)\b/.test(text)) return { intent: 'interested', matchedKeyword: 'sim' };
  if (/^(nao|n)\b/.test(text)) return { intent: 'not_interested', matchedKeyword: 'nao' };

  return { intent: 'unclear', matchedKeyword: null };
}

module.exports = { classifyIntent, normalize };
