// Cliente Claude compartilhado pelos Agentes 2 e 3.
// Usa o Messages API com saída estruturada (output_config.format json_schema)
// e adaptive thinking. Sem ANTHROPIC_API_KEY, retorna null e os agentes caem
// no modo heurístico (posts saem com status "Revisar").

const MODEL = process.env.AEL_MODEL || 'claude-opus-4-8';

let clientePromise = null;

function obterCliente() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!clientePromise) {
    const Anthropic = require('@anthropic-ai/sdk');
    clientePromise = new Anthropic();
  }
  return clientePromise;
}

/**
 * Chamada com saída estruturada validada por JSON Schema.
 * @param {{system: string, user: string, schema: object, maxTokens?: number}} p
 * @returns {Promise<object|null>} objeto validado ou null se sem API key
 */
async function chamarEstruturado({ system, user, schema, maxTokens = 8000 }) {
  const client = obterCliente();
  if (!client) return null;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Solicitação recusada pelos classificadores de segurança do modelo.');
  }
  const bloco = response.content.find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem bloco de texto.');
  return JSON.parse(bloco.text);
}

module.exports = { chamarEstruturado, obterCliente, MODEL };
