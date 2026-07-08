# Imóvel IA — Assistente de busca de imóveis no site (a "MaquinIA" própria)

Réplica da tecnologia mostrada no vídeo da Oron: um chat de IA no site da
imobiliária que entende linguagem natural ("apartamento 2 quartos até R$ 450
mil perto do Centro") e responde com **cards dos imóveis reais do estoque**,
mantendo a conversa e capturando o lead para o WhatsApp/SDR.

## O túnel dos dados (arquitetura)

```
Tecimob (catálogo · fonte da verdade — nada muda lá)
   │  feed XML (painel → Integrações/Portais)  ou  crawler do subdomínio
   ▼
importer.js  →  data/imovel-ia/imoveis.json   (inventário normalizado, atualizado por agendamento)
   ▼
server.js (Node/Express)
   ├─ /api/chat      → Claude com tool use (buscar_imoveis · registrar_lead)
   ├─ /api/destaques → vitrine da home (sem custo de IA)
   ├─ /              → página moderna de busca conversacional (candidata a novo site)
   ├─ /widget.js     → botão flutuante embutível (Lovable e/ou Tecimob)
   └─ /admin         → leads, uso e status da importação
   ▼
Lead → data/imovel-ia/leads.json + fila data/handoff-queue.json (mesma do agente SDR) + botão wa.me
```

A IA **nunca inventa imóvel**: ela é obrigada a chamar a ferramenta
`buscar_imoveis` e só apresenta o que a busca local retornar.

## Início rápido

```bash
npm install
node imovel-ia/importer.js --exemplo    # inventário de demonstração (8 imóveis)
npm run imoveis                         # http://localhost:3020
```

Com o feed real do Tecimob:

```bash
node imovel-ia/importer.js "https://URL-DO-FEED-DO-TECIMOB.xml"
# ou, sem feed: node imovel-ia/importer.js --site https://imoveis.aelimoveis.com.br
```

Agende a atualização (crontab, a cada 6h):
`0 */6 * * * cd /opt/sdr-vendas && node imovel-ia/importer.js "URL_DO_FEED" >> data/imovel-ia/import.log 2>&1`

## Variáveis (.env)

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Liga a IA (sem ela o chat degrada com aviso e o resto funciona) |
| `CLAUDE_MODEL_IMOVEIS` | Padrão `claude-haiku-4-5` (widget público, custo baixo). Use `claude-opus-4-8` para máxima qualidade |
| `IMOVEL_IA_EMPRESA` / `IMOVEL_IA_CIDADES` | Identidade do assistente |
| `IMOVEL_IA_WHATSAPP` | WhatsApp da equipe (recebe os leads via wa.me) |
| `IMOVEL_IA_ADMIN_TOKEN` | Protege `/admin?token=...` |
| `IMOVEL_IA_HOST` / `IMOVEL_IA_PORT` | Endereço do servidor (padrão 127.0.0.1:3020) |

## Instalação no site

- **Lovable (aelimoveis.com.br):** peça ao Lovable para adicionar
  `<script src="https://SEU-HOST/widget.js"></script>` antes de `</body>`.
- **Tecimob (imoveis.aelimoveis.com.br):** cole o mesmo script no campo de
  scripts/GTM do painel do Tecimob.
- **Página completa:** aponte `busca.aelimoveis.com.br` (CNAME) para o servidor —
  ela já funciona como uma home moderna (chat + vitrine de destaques) e pode
  ser promovida a site principal depois de validada.

## Leads

Todo lead capturado pela IA: (1) fica em `data/imovel-ia/leads.json`; (2) entra
na fila `data/handoff-queue.json` — a mesma consumida pelo atendimento humano do
agente SDR; (3) o visitante recebe o botão "Falar agora no WhatsApp".
