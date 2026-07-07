# Boletim A&L — Sistema de agentes para noticias.aelimoveis.com.br

Sistema de 3 agentes de IA que alimenta, duas vezes por dia (**08h00** e **22h00**,
horário de Brasília), o mini blog editorial da **A&L | Negócios Imobiliários**:
notícias, análises curtas e interpretações práticas sobre mercado financeiro,
Selic, juros, inflação, crédito imobiliário, construção civil e mercado
imobiliário brasileiro — no tom sóbrio, técnico e consultivo da marca.

```
noticias/
├── config/
│   ├── fontes.js          # fontes prioritárias/complementares + APIs BCB
│   └── temas.js           # 14 temas, categorias e prioridades
├── src/
│   ├── agents/
│   │   ├── agente1-coletor.js    # AGENTE 1 — Coletor de Mercado e Fontes
│   │   ├── agente2-analista.js   # AGENTE 2 — Analista Macro-Imobiliário
│   │   └── agente3-editor.js     # AGENTE 3 — Editor, SEO e Publicador
│   ├── lib/               # http, rss, texto, logger, claude (SDK Anthropic)
│   ├── compliance.js      # frases proibidas, limites, antiplágio, status
│   ├── db.js              # banco JSON (data/db.json)
│   ├── pipeline.js        # orquestração de uma rodada
│   ├── run.js             # entrada: node src/run.js [manha|noite]
│   └── site/build.js      # gerador do mini blog estático (public/)
├── data/db.json           # banco de dados versionado
├── relatorios/            # AAAA-MM-DD-rodada.{json,md}
├── logs/                  # JSONL diário de coleta/seleção/publicação/rejeição
└── public/                # site pronto para deploy (GitHub Pages)
```

## 1. Desenho dos 3 agentes

| Agente | Natureza | Função |
|---|---|---|
| **1 — Coletor** | Determinístico (sem LLM) | Varre RSS oficiais, Google News RSS e APIs públicas (BCB SGS + Focus); extrai título, data, autor, URL, fonte e resumo; deduplica; classifica pelos 14 temas; pontua 0–100 e entrega o top 10 com motivo de seleção. |
| **2 — Analista** | Claude (`claude-opus-4-8`) com saída estruturada | Cruza o top 10, escolhe 1–3 temas do dia e responde: o que aconteceu, por que importa, impacto financeiro, impacto imobiliário, impacto regional (Recife/PE/NE), confirmação por fonte primária, grau de confiança e recomendação (publicar / aguardar / descartar). |
| **3 — Editor** | Claude com saída estruturada + validador de compliance | Redige 1–3 posts de até 1.500 caracteres com bloco "Leitura A&L", fontes, tags, slug SEO, meta description (≤155) e status (Publicar / Revisar / Rascunho / Não publicar). |

A separação é deliberada: o Coletor é barato e auditável; o Analista decide *o que* merece publicação; o Editor decide *como* dizer. Sem `ANTHROPIC_API_KEY`, os agentes 2 e 3 caem em modo heurístico e **todo post sai como "Revisar"** — o sistema nunca publica conteúdo não supervisionado sem IA.

## 2. Fluxo de trabalho

```
08h00 / 22h00 (cron)
   │
   ▼
AGENTE 1  coleta → dedup → classificação → score → top 10 ─┐
   │                                                        │ descartadas + motivo
   ▼                                                        ▼
AGENTE 2  parecer editorial (1–3 temas, confiança, recomendação)
   │  publicar                │ aguardar/descartar
   ▼                          ▼
AGENTE 3  posts + compliance  registro interno (arquivadas)
   │
   ▼
data/db.json → relatorios/*.{json,md} → logs/*.jsonl → public/ (site) → deploy
```

## 3. Rotina diária

- **08h00** — varredura da madrugada/manhã (janela de 12h), conferência de
  indicadores oficiais, nota matinal curta se houver tema forte; caso contrário,
  apenas registro interno (`status_final: registro_interno`).
- **22h00** — fechamento do dia (janela de 16h), leitura consolidada; o prompt
  do Analista muda para priorizar consolidação. URLs já usadas em rodadas
  anteriores são excluídas, evitando repetição; o post da manhã pode ser
  complementado pelo post de fechamento do mesmo tema.

Agendamento: `.github/workflows/noticias.yml` (cron `0 11 * * *` = 08h BRT e
`0 1 * * *` = 22h BRT; também aceita disparo manual com escolha de rodada).

## 4. Estrutura do mini blog

Site estático gerado em `public/` com identidade A&L (fundo claro, serifada
elegante, azul-marinho `#14263f`, cinza, detalhes discretos em vermelho
`#b3282d`) e cara de boletim de inteligência, não de portal.

Páginas: `/` (destaque do dia, últimas análises, categorias, indicadores,
fontes, aviso editorial) · `/noticias` · `/selic-juros` · `/mercado-imobiliario`
· `/credito-imobiliario` · `/inflacao` · `/indicadores` · `/sobre` ·
`/politica-editorial` · `/fontes` · uma página por post
(`/noticias/<slug>/`) · `feed.xml` · `sitemap.xml` · `robots.txt` · `CNAME`.

Somente posts com status **Publicar** são renderizados. O aviso editorial fixo
aparece no rodapé de todas as páginas.

## 5. Modelo de banco de dados

`data/db.json` — versionado no git a cada rodada (histórico completo via git):

- `posts[]`: id, dataColeta, dataPublicacao, rodada, fonteOriginal, urlOriginal,
  tituloOriginal, tituloEditorial, categoria, tags, resumoBruto, analiseAgente2,
  textoFinal, leituraAEL, fontes, metaDescription, slug, scoreRelevancia,
  grauConfianca, status, historico[] (trilha de alterações).
- `arquivadas[]`: registros internos (aguardando confirmação ou descartados).
- `indicadores`: última leitura de Selic/IPCA/IGP-M/INPC (BCB SGS) + medianas do Focus.
- `rodadas[]`: data, rodada, status final, posts gerados, alertas.

## 6. Coleta e filtragem

Fontes em `config/fontes.js` — os 7 blocos prioritários (BCB, IBGE, InfoMoney,
Valor, Money Times, Brazil Journal/Metro Quadrado, FipeZAP/CBIC/ABRAINC/Secovi)
e complementares (Agência Brasil, Caixa/MCMV, regional Recife/NE), cada uma com
peso de autoridade. Regras: só RSS oficial, APIs públicas, Google News RSS e
páginas públicas; de paywall, apenas título/chamada/metadados; link canônico
sempre; nunca texto integral.

**Score (0–100)** por notícia: 25% impacto juros/crédito/inflação · 20% impacto
imobiliário · 15% autoridade da fonte · 15% recência · 10% relação com
comprador/vendedor/investidor · 10% dado objetivo (%, R$, variação) · 5%
relação regional.

## 7. Critérios de publicação

1. Agente 2 recomenda `publicar` apenas para temas com gatilho editorial válido
   (Selic, inflação, crédito, dados setoriais, FIIs/incorporadoras, educação de
   mercado); `aguardar` quando falta confirmação por fonte primária.
2. Agente 3 aplica compliance (item 10) — qualquer falha rebaixa para "Revisar".
3. Política de score: **> 75 → Publicar** (se `AEL_AUTO_PUBLISH=true`);
   **60–75 → Rascunho**; **< 60 → Não publicar** (registro interno).
4. Máximo de 3 posts por rodada (`AEL_MAX_POSTS`).

## 8. Modelo de texto

Definido no system prompt do Agente 3 e validado pelo compliance: título curto;
texto ≤ 1.500 caracteres, informativo e analítico; bloco **Leitura A&L** com a
consequência prática; fontes citadas ao final; frases sóbrias ("o cenário
merece acompanhamento", "imóveis bem localizados tendem a preservar maior
liquidez"); proibidas frases promocionais e promessas de resultado.

## 9. Logs

`logs/AAAA-MM-DD.jsonl` — um evento por linha: `coleta.fonte.ok/erro`,
`coleta.resumo`, `agente2.ok/fallback/erro`, `agente3.post`, `indicadores.*`,
`rodada.inicio/fim`. Relatórios por rodada em `relatorios/` (JSON interno no
formato especificado + Markdown editorial com parecer, posts, alertas e
descartadas com motivo).

## 10. Revisão e prevenção de erro

- **Compliance automático** (`src/compliance.js`): limite de 1.500/155
  caracteres, fontes obrigatórias, slug válido, categoria válida e lista de
  frases proibidas. Falhou → "Revisar", nunca publica.
- **Fonte primária**: grau de confiança "alto" exige BCB/IBGE/FipeZAP/CBIC/
  ABRAINC/Secovi ou convergência de fontes; sem confirmação → `aguardar`.
- **Saída estruturada** (JSON Schema no Messages API) elimina posts malformados.
- **Fallback em camadas**: sem rede → rodada vira registro interno; sem API key
  → modo heurístico com revisão humana obrigatória; erro no LLM → idem.
- **Chave de revisão humana**: `AEL_AUTO_PUBLISH=false` força "Revisar" em tudo.

## 11. Proteção contra plágio e direitos autorais

- O Coletor guarda no máximo 600 caracteres de resumo público por matéria.
- O Editor é instruído a reescrever sempre; o validador antiplágio compara o
  texto final com títulos/resumos originais e bloqueia qualquer trecho literal
  ≥ ~90 caracteres.
- Fonte citada por nome no corpo + link canônico ("matéria de referência") nos
  metadados de cada post. Paywall nunca é contornado.

## 12. Publicação automática

GitHub Actions → commit de `data/`, `relatorios/`, `logs/` e `public/` →
deploy do `public/` em **GitHub Pages**. Para ativar:

1. Settings → Pages → Source: *GitHub Actions*.
2. Criar o secret **`ANTHROPIC_API_KEY`** (Settings → Secrets → Actions).
3. No DNS de `aelimoveis.com.br`, criar `CNAME noticias → <org>.github.io`
   (o arquivo `CNAME` já sai no build).

Alternativas: apontar Netlify/Cloudflare Pages para `noticias/public`, ou rodar
via cron em servidor próprio (`crontab`: `0 8,22 * * * cd ~/sdr-vendas/noticias && node src/run.js`,
com TZ=America/Sao_Paulo).

## 13. Plano de implantação

| Fase | Ação | Critério de saída |
|---|---|---|
| 1. Preparação | Secret `ANTHROPIC_API_KEY`; Pages ativo; DNS do subdomínio | `workflow_dispatch` roda verde |
| 2. Piloto assistido (1–2 semanas) | `AEL_AUTO_PUBLISH=false`; revisar `relatorios/*.md` e promover posts manualmente | Tom e precisão aprovados pela A&L |
| 3. Semiautomático | `AEL_AUTO_PUBLISH=true` (publica só score > 75); revisão diária dos rascunhos | ≥ 95% dos posts publicados sem correção |
| 4. Operação plena | Monitorar `logs/` e alertas; ajustar pesos/fontes em `config/` | Rotina 08h/22h estável |

## 14. Execução local

```bash
cd noticias
npm install
cp .env.example .env        # preencher ANTHROPIC_API_KEY
npm run rodada:manha        # ou rodada:noite / rodada (infere pelo horário)
npm run build:site          # regenera public/ a partir do banco
npm test                    # 11 testes (score, compliance, antiplágio, RSS…)
```

---

**Aviso editorial fixo** (rodapé de todas as páginas): *"As análises publicadas
neste boletim têm caráter exclusivamente informativo e editorial. A A&L |
Negócios Imobiliários não presta recomendação de investimento financeiro. A
decisão de compra, venda, locação ou investimento imobiliário deve considerar o
perfil, o momento e a documentação de cada operação."*
