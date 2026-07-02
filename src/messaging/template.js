function firstName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Mensagem de reaproximação leve: tom amigável, sem pressão, pergunta aberta sobre
// vender/alugar/comprar. Assinatura da empresa/consultor é configurável.
function buildInitialMessage(name, { companyName = 'nossa imobiliária', agentName = '' } = {}) {
  const first = firstName(name);
  const greeting = first ? `Oi, ${first}! Tudo bem?` : 'Oi! Tudo bem?';
  const signature = agentName ? `${agentName}, da ${companyName}` : `da ${companyName}`;

  return [
    `${greeting} 😊`,
    `Aqui é ${signature}. Faz um tempo que a gente não conversa, e eu queria só dar um alô rapidinho, sem compromisso nenhum.`,
    'Você tem pensado em vender, alugar ou comprar algum imóvel ultimamente? Se fizer sentido pra você, me conta que eu te ajudo com todo gosto!',
  ].join('\n\n');
}

module.exports = { firstName, buildInitialMessage };
