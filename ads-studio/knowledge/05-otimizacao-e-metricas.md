# 05 · Otimização — métricas, rotina e regras de decisão

Ter "campanhas campeãs de otimização" = ter **rotina + regras pré-combinadas**, não mexer por ansiedade. Este playbook alimenta o agente Analista de Otimização.

## As 6 métricas que importam (e a ordem de diagnóstico)

| # | Métrica | O que mede | Sinal saudável (referência inicial BR imobiliário) |
|---|---|---|---|
| 1 | CPM | Custo de entrega / competição no leilão | R$ 15-45 (varia por região/época) |
| 2 | Hook rate (vídeos) | 3s views ÷ impressões — força do gancho | ≥ 25% |
| 3 | CTR (link) | Anúncio gera ação? | ≥ 1% feed · ≥ 0,6% stories |
| 4 | CPL | Custo por lead | Captação proprietário R$ 15-40 · comprador econômico R$ 8-25 · média-alta R$ 25-70 |
| 5 | Taxa de qualificação | % de leads que respondem/têm perfil | ≥ 40% respondendo no WhatsApp |
| 6 | Frequência | Saturação do público | < 2,5 em 7 dias (frio) |

**Ordem de diagnóstico quando o CPL está alto:** CPM alto? (problema de leilão/público) → CTR/hook baixo? (problema de criativo) → CTR bom e CPL alto? (problema de oferta/formulário) → CPL bom e lead ruim? (problema de qualificação — endureça o formulário).

> Benchmarks são ponto de partida. Depois de 2-3 semanas, o benchmark é a **média da sua própria conta** — anote os números semanais nas notas de cada campanha do painel.

## Regras de decisão (pré-combinadas, sem emoção)

**Matar:**
- Anúncio com ≥ 1.500 impressões e CTR < 0,8% → pausar.
- Anúncio com gasto ≥ 2× CPL alvo e 0 leads → pausar.
- Palavra-chave (Google) com 30+ cliques e 0 conversões → pausar.

**Escalar:**
- Conjunto batendo CPL alvo por 3+ dias → +20% de verba a cada 2-3 dias. **Nunca dobrar** (reinicia o aprendizado).
- Criativo vencedor claro → duplicar a hipótese dele em 2 novas variações (mesmo gancho, outra prova/formato).

**Esperar (a decisão mais difícil):**
- Conjunto novo: 3-4 dias ou ~2.000 impressões sem mexer.
- Fase de aprendizado (Meta): idealmente 50 eventos de conversão/semana por conjunto — com verba pequena, aceite sair do aprendizado devagar; concentrar verba em menos conjuntos ajuda exatamente nisso.

## Rotina

**Diária (5 min):** gasto anormal? anúncio reprovado? leads sendo atendidos em < 5 min?

**2x por semana (20 min):** aplicar regras de matar/escalar · conferir frequência · (Google) negativar termos de pesquisa lixo.

**Semanal (30 min):** registrar métricas nas notas da campanha no painel · comparar CPL por categoria · decidir 1 teste novo da semana (1 só!) · pedir leitura ao agente Analista colando os números.

**Mensal:** realocar verba entre categorias pelo custo por **negócio encaminhado** (visita/avaliação agendada), não por CPL bruto. Lead barato que não responde é caro.

## Sinais de saturação e o que fazer

- Frequência ↑ + CTR ↓ na mesma semana = criativo cansou → nova leva de criativos (gerador do painel) antes de subir verba.
- CPM subindo sem mudança sua = leilão mais caro (época/concorrência) → aceite ou melhore o criativo; não adianta trocar público toda hora.
- Leads caindo de qualidade = formulário frouxo ou promessa exagerada no anúncio.

## O multiplicador silencioso: velocidade de atendimento

Estudos de conversão imobiliária são unânimes: responder em **até 5 minutos** multiplica a taxa de contato. Conecte os leads ao WhatsApp imediatamente — o agente SDR deste repositório (`npm start`) faz a reaproximação e o menu de qualificação automaticamente. Tráfego bom + atendimento lento = dinheiro queimado.
