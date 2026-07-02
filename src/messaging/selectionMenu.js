// Opções da "caixa de seleção" enviada logo após a primeira resposta do cliente.
// Cada opção tem um id estável (usado pela lista interativa do WhatsApp) e a intenção
// de negócio correspondente, usada pelo sdrAgent para decidir o próximo passo.
const SELECTION_OPTIONS = [
  { id: 'opt_interesse_vender', title: 'Sim, tenho interesse em vender', intent: 'interested' },
  { id: 'opt_sem_interesse', title: 'Não tenho interesse, obrigado', intent: 'not_interested' },
  { id: 'opt_parar_mensagens', title: 'Favor parar de enviar mensagens.', intent: 'opt_out' },
];

const SELECTION_MENU_BODY = 'Perfeito! Pra eu te ajudar melhor, escolhe uma das opções abaixo:';
const SELECTION_MENU_BUTTON_TEXT = 'Ver opções';
const SELECTION_MENU_FOOTER = 'Você também pode responder com suas próprias palavras.';

function findOptionById(id) {
  return SELECTION_OPTIONS.find((option) => option.id === id) || null;
}

// Texto do menu em formato simples, usado como fallback quando a lista interativa
// do WhatsApp não pode ser enviada (ex.: recurso bloqueado para o número/conta).
function buildPlainTextMenu() {
  const lines = SELECTION_OPTIONS.map((option, index) => `${index + 1}. ${option.title}`);
  return [SELECTION_MENU_BODY, lines.join('\n'), SELECTION_MENU_FOOTER].join('\n\n');
}

// Quando o cliente digita a resposta em vez de tocar na lista (ex.: "1" ou "2"),
// interpreta o número como a opção correspondente.
function matchOptionByNumber(rawText) {
  const match = String(rawText || '').trim().match(/^([1-3])\b/);
  if (!match) return null;
  return SELECTION_OPTIONS[Number(match[1]) - 1] || null;
}

module.exports = {
  SELECTION_OPTIONS,
  SELECTION_MENU_BODY,
  SELECTION_MENU_BUTTON_TEXT,
  SELECTION_MENU_FOOTER,
  findOptionById,
  buildPlainTextMenu,
  matchOptionByNumber,
};
