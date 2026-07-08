'use strict';

// Motor de conversa do assistente de imóveis: loop de tool-use com a API da Claude.
// A IA consulta o inventário local via ferramenta (nunca inventa imóvel) e
// registra leads quando o visitante demonstra interesse.
const Anthropic = require('@anthropic-ai/sdk');
const { buscarImoveis, resumoParaIA } = require('./search');
const store = require('./store');

// Widget público de site = volume alto → o plano aprovado recomenda Haiku por padrão
// (custo de centavos por conversa). Para máxima qualidade: CLAUDE_MODEL_IMOVEIS=claude-opus-4-8.
const MODEL = process.env.CLAUDE_MODEL_IMOVEIS || process.env.CLAUDE_MODEL || 'claude-haiku-4-5';
const MAX_TOKENS = Number(process.env.IMOVEL_IA_MAX_TOKENS || 1200);
const MAX_TOOL_ROUNDS = 4;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const NOT_CONFIGURED_MSG =
  'O assistente ainda não está ativo (falta configurar a chave ANTHROPIC_API_KEY no servidor). ' +
  'Enquanto isso, fale direto com a nossa equipe pelo WhatsApp. 😉';

const TOOLS = [
  {
    name: 'buscar_imoveis',
    description:
      'Busca imóveis no estoque real da imobiliária. Use SEMPRE que o visitante descrever o que procura, antes de citar qualquer imóvel. Bairro e termo são usados como ranking (se não houver nada no bairro exato, retorna os mais parecidos e o campo exatosNoBairro indica quantos eram do bairro pedido).',
    input_schema: {
      type: 'object',
      properties: {
        finalidade: { type: 'string', enum: ['venda', 'aluguel'], description: 'Comprar = venda; alugar = aluguel' },
        tipo: { type: 'string', description: 'apartamento, casa, terreno, sala...' },
        cidade: { type: 'string' },
        bairro: { type: 'string', description: 'Bairro ou região citada (inclusive pontos de referência, ex.: "perto do colégio X" → use o bairro se souber)' },
        precoMin: { type: 'number' },
        precoMax: { type: 'number' },
        quartosMin: { type: 'number' },
        suitesMin: { type: 'number' },
        vagasMin: { type: 'number' },
        areaMin: { type: 'number' },
        termo: { type: 'string', description: 'Palavras-chave livres (ex.: piscina, mobiliado, frente mar, pet)' },
        limite: { type: 'number', description: 'Máx. de resultados (padrão 6)' },
      },
    },
  },
  {
    name: 'registrar_lead',
    description:
      'Registra o interesse do visitante para a equipe humana dar sequência. Use SOMENTE depois de ter o nome e o WhatsApp do visitante (peça com naturalidade quando ele demonstrar interesse real em um imóvel ou em visitar).',
    input_schema: {
      type: 'object',
      required: ['nome', 'whatsapp'],
      properties: {
        nome: { type: 'string' },
        whatsapp: { type: 'string', description: 'Telefone com DDD' },
        imovelId: { type: 'string', description: 'ID do imóvel de interesse, se houver um específico' },
        resumo: { type: 'string', description: 'Resumo de 1 frase do que o cliente procura' },
      },
    },
  },
];

function buildSystem(settings) {
  const estavel = `Você é o assistente virtual de uma imobiliária brasileira, incorporado no site dela (como um chat).
Seu trabalho: entender o que o visitante procura, buscar no estoque REAL via ferramenta buscar_imoveis e apresentar as melhores opções.

REGRAS INEGOCIÁVEIS:
1. NUNCA cite, descreva ou invente um imóvel que não tenha vindo da ferramenta buscar_imoveis nesta conversa.
2. Sempre que apresentar imóveis, termine a mensagem com uma linha exatamente neste formato: [[IMOVEIS:id1,id2,id3]] com os IDs dos imóveis que você apresentou (o site transforma isso em cards com foto). Não descreva preço/quartos em texto longo — os cards já mostram; faça só 1 frase de contexto por opção no máximo.
3. Se a busca voltar vazia ou sem opção no bairro pedido, diga isso com transparência e ofereça as alternativas mais próximas (a ferramenta já as retorna) ou pergunte se pode ampliar a busca.
4. Quando o visitante demonstrar interesse real (quer detalhes, visita, condições), peça nome e WhatsApp com naturalidade e chame registrar_lead. Depois confirme que a equipe vai chamá-lo no WhatsApp.
5. Uma pergunta de cada vez. Respostas curtas (2-4 frases), tom acolhedor e profissional, português do Brasil. Emojis com muita moderação.
6. Você não negocia preço, não promete aprovação de financiamento e não garante valorização; nesses temas, direcione para a equipe.
7. Assuntos fora de imóveis/da imobiliária: redirecione com educação para o tema imóveis.
8. Referências de localização (ex.: "perto da escola X"): use o bairro/região correspondente se você souber pela conversa, ou pergunte o bairro.`;

  const system = [{ type: 'text', text: estavel, cache_control: { type: 'ephemeral' } }];
  const contexto = [
    `Imobiliária: ${settings.empresa || 'A&L Negócios Imobiliários'}`,
    settings.cidades ? `Cidades de atuação: ${settings.cidades}` : '',
    settings.whatsapp ? `WhatsApp da equipe: ${settings.whatsapp}` : '',
    `Estoque atualizado em: ${settings.inventarioAtualizadoEm || 'desconhecido'} (${settings.totalImoveis ?? '?'} imóveis).`,
  ].filter(Boolean).join('\n');
  system.push({ type: 'text', text: `Contexto atual:\n${contexto}` });
  return system;
}

async function conversar({ history, userMessage, settings, onLead }) {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, text: NOT_CONFIGURED_MSG, imoveis: {} };

  const messages = [...(history || []).slice(-16), { role: 'user', content: userMessage }];
  const imoveisApresentaveis = {}; // id -> dados completos p/ o frontend montar cards
  let leadRegistrado = null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystem(settings),
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return { ok: true, text: 'Desculpe, não consigo ajudar com esse assunto. Posso te ajudar a encontrar um imóvel? 😊', imoveis: {}, messages };
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      messages.push({ role: 'assistant', content: response.content });
      return { ok: true, text, imoveis: imoveisApresentaveis, leadRegistrado, messages, usage: response.usage };
    }

    // Executa todas as ferramentas pedidas e devolve os resultados em UMA mensagem.
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let result;
      try {
        if (block.name === 'buscar_imoveis') {
          const out = buscarImoveis(block.input);
          for (const imovel of out.imoveis) imoveisApresentaveis[imovel.id] = imovel;
          result = JSON.stringify({
            total: out.total,
            exatosNoBairro: out.exatosNoBairro,
            imoveis: out.imoveis.map(resumoParaIA),
          });
          store.bumpStat('buscas');
        } else if (block.name === 'registrar_lead') {
          leadRegistrado = onLead ? await onLead(block.input) : store.addLead(block.input);
          result = JSON.stringify({ ok: true, mensagem: 'Lead registrado. A equipe vai chamar no WhatsApp.' });
          store.bumpStat('leads');
        } else {
          result = JSON.stringify({ erro: `Ferramenta desconhecida: ${block.name}` });
        }
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Erro: ${err.message}`, is_error: true });
        continue;
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    messages.push({ role: 'user', content: results });
  }

  return {
    ok: true,
    text: 'Encontrei bastante coisa! Me diga um pouco mais do que você procura para eu afinar as opções. 😊',
    imoveis: imoveisApresentaveis,
    leadRegistrado,
    messages,
  };
}

module.exports = { conversar, isConfigured, MODEL, TOOLS };
