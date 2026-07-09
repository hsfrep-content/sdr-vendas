'use strict';

// Wrapper fino sobre o SDK oficial da Anthropic, com foco em economia de tokens:
// - prompt caching no system prompt (prefixo estável primeiro, contexto volátil depois);
// - histórico enviado limitado às últimas mensagens;
// - max_tokens conservador por tipo de tarefa.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const CHAT_MAX_TOKENS = Number(process.env.CLAUDE_CHAT_MAX_TOKENS || 1500);
const GEN_MAX_TOKENS = Number(process.env.CLAUDE_GEN_MAX_TOKENS || 3000);

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const NOT_CONFIGURED_MSG =
  'A chave da API da Claude não está configurada. Adicione ANTHROPIC_API_KEY no arquivo .env ' +
  '(crie a chave em https://platform.claude.com) e reinicie o painel. ' +
  'Todo o resto do painel — produtos, imagens, campanhas e playbooks — funciona sem a chave.';

function buildSystem(stablePrompt, volatileContext) {
  // O prompt estável do agente vai primeiro e recebe o breakpoint de cache;
  // o contexto do negócio (que o usuário pode editar) vai depois, para não
  // invalidar o cache do prefixo a cada edição.
  const system = [
    { type: 'text', text: stablePrompt, cache_control: { type: 'ephemeral' } },
  ];
  if (volatileContext) system.push({ type: 'text', text: `Contexto atual do negócio:\n${volatileContext}` });
  return system;
}

function extractText(response) {
  if (response.stop_reason === 'refusal') {
    return 'O modelo recusou esta solicitação por política de segurança. Reformule o pedido.';
  }
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function chat({ systemPrompt, businessCtx, history, userMessage }) {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, text: NOT_CONFIGURED_MSG };

  // Mantém só as últimas 12 mensagens do histórico para conter o custo.
  const messages = [...(history || []).slice(-12), { role: 'user', content: userMessage }];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: CHAT_MAX_TOKENS,
    system: buildSystem(systemPrompt, businessCtx),
    messages,
  });
  return { ok: true, text: extractText(response), usage: response.usage };
}

const CREATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variacoes'],
  properties: {
    variacoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'textoPrimario', 'headline', 'descricao', 'cta', 'roteiro', 'racional'],
        properties: {
          titulo: { type: 'string', description: 'Nome interno curto da variação (ex.: "Gancho dor - avaliação grátis")' },
          textoPrimario: { type: 'string', description: 'Texto primário do anúncio, gancho na primeira linha' },
          headline: { type: 'string', description: 'Título de até 40 caracteres' },
          descricao: { type: 'string', description: 'Descrição de até 30 caracteres' },
          cta: { type: 'string', description: 'Botão de CTA (ex.: Saiba mais, Cadastre-se)' },
          roteiro: { type: 'string', description: 'Para vídeo: roteiro cena a cena (fala + texto na tela + duração). Para estático: instrução de arte em 1-2 frases.' },
          racional: { type: 'string', description: 'Uma frase: por que essa variação deve funcionar e o que ela testa' },
        },
      },
    },
  },
};

async function generateCreatives({ systemPrompt, businessCtx, brief }) {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, error: NOT_CONFIGURED_MSG };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: GEN_MAX_TOKENS,
    system: buildSystem(systemPrompt, businessCtx),
    output_config: { format: { type: 'json_schema', schema: CREATIVE_SCHEMA } },
    messages: [{ role: 'user', content: brief }],
  });

  if (response.stop_reason === 'refusal') {
    return { ok: false, error: 'O modelo recusou esta solicitação por política de segurança. Ajuste o briefing.' };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    const parsed = JSON.parse(text);
    return { ok: true, variacoes: parsed.variacoes || [], usage: response.usage };
  } catch {
    return { ok: false, error: 'A resposta do modelo não veio no formato esperado. Tente novamente.' };
  }
}

module.exports = { chat, generateCreatives, isConfigured, MODEL };
