# Ads Studio — Painel de tráfego imobiliário com agentes de IA

Painel web (tema claro, fundo branco, layout estilo CRM) para planejar, criar e
otimizar campanhas de **Meta Ads** (captação de imóveis para venda e aluguel +
venda para compradores) e **Google Ads** (fundo de funil, público comprador),
com uma equipe de **5 agentes de IA especializados**.

## Início rápido

```bash
npm install
cp .env.example .env    # se ainda não tiver; preencha ANTHROPIC_API_KEY para ativar a IA
npm run ads
```

Abra `http://localhost:3010`.

> Sem `ANTHROPIC_API_KEY`, o painel inteiro funciona (empreendimentos, imagens,
> campanhas, checklists e playbooks) — apenas o chat com agentes e o gerador de
> criativos ficam desativados, com aviso claro na tela.

## O que tem dentro

| Área | O que faz |
|---|---|
| **Visão Geral** | Números do repositório e as 6 frentes de trabalho (categorias de campanha) |
| **Agentes de IA** | Chat com Orquestrador, Especialista Meta Ads, Especialista Google Ads, Diretor de Criativos e Analista de Otimização |
| **Empreendimentos** | Cadastro dos produtos + repositório de imagens/vídeos por empreendimento |
| **Criativos** | Repositório unificado com geração por IA (variações A/B com texto primário, headline, CTA e roteiro de vídeo), status testando/aprovado e botão "copiar para o Gerenciador" |
| **Campanhas** | Planejamento por categoria com checklist técnico de lançamento (Meta e Google) e notas de métricas semanais |
| **Playbooks** | 5 guias completos: captação de proprietários no Instagram, venda dos 2 produtos, plano dos R$ 1.100 no Google, criativos e otimização |
| **Contexto do Negócio** | Cidade-base, raio, produtos e verbas — injetado automaticamente em todos os agentes |

## As 6 frentes de campanha

1. Captação de Vendas e Locações
2. Campanhas Voltadas para Vendas
3. Captação de Novos Vendedores (Proprietários)
4. Captação de Novos Aluguéis
5. Tráfego com Foco em Vendas no Litoral
6. Tráfego para Venda — Ticket Econômico (Meta + Google)

## Economia de tokens (por design)

- **Conhecimento local**: os playbooks são arquivos Markdown lidos no navegador — aprender a estratégia custa **zero tokens**.
- **Prompt caching**: o prompt de cada agente é estável e cacheado pela API (leituras a ~10% do preço).
- **Contexto mínimo**: cada chamada envia só o contexto do negócio (poucas linhas) + as últimas 12 mensagens.
- **Limites configuráveis**: `CLAUDE_CHAT_MAX_TOKENS` e `CLAUDE_GEN_MAX_TOKENS` no `.env`.
- **Modelo configurável**: `CLAUDE_MODEL=claude-haiku-4-5` para o modo mais econômico.

## Onde ficam os dados

Tudo local, fora do controle de versão: `data/ads-studio/db.json` (produtos,
criativos, campanhas, conversas) e `data/ads-studio/uploads/` (imagens).
Faça backup dessa pasta se quiser preservar o repositório.
