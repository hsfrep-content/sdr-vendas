function firstName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Mensagem de reaproximação leve: tom amigável, sem pressão, pergunta aberta sobre
// vender/alugar/adquirir. Nome do consultor vem em *negrito* (formatação nativa do WhatsApp).
function buildInitialMessage(
  name,
  { companyName = 'A&L Negócios Imobiliários', agentName = 'Linhares', agentRole = 'corretor de imóveis e gestor de negócios' } = {}
) {
  const first = firstName(name);
  const greeting = first ? `Oi, ${first}! Tudo bem? 😊` : 'Oi! Tudo bem? 😊';

  return [
    greeting,
    `Aqui é o *${agentName}*, ${agentRole} da ${companyName}. Faz um tempo desde a última vez que tivemos contato e eu estou retomando esse para te perguntar:`,
    'Você tem pensado em vender, alugar ou adquirir algum imóvel ultimamente?',
    'Se sim, me conta o que você busca nesse momento, vai ser um prazer te ajudar!',
  ].join('\n\n');
}

module.exports = { firstName, buildInitialMessage };
