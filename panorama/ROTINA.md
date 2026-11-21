# Rotina diária — Panorama do Dia @linhares.m2

Instruções para a sessão agendada (todo dia, antes das 7h de Brasília). Siga na ordem.

## 1. Varredura (coleta)
Busque as notícias das últimas 24–72h (inclua o fim de semana quando for segunda-feira) sobre:
- Selic/Copom/ata, DI e juros futuros, Boletim Focus (sai às segundas), IPCA/IPCA-15, IGP-M, INCC-M
- dólar, Ibovespa, fiscal (arcabouço, pacotes, dívida), Fed e juros nos EUA
- crédito imobiliário: Caixa, bancos privados, poupança/SBPE (BC e Abecip), FGTS, MCMV, consórcio
- preços (FipeZap venda/locação, IGMI-R), lançamentos e vendas (Abrainc, CBIC, Secovi), distratos, leilões
- Recife/Pernambuco quando houver dado regional

Fontes prioritárias: Valor Econômico, O Globo, Gazeta do Povo, CNN Brasil, BandNews, InfoMoney, Investing BR, Folha, Estadão, Metro Quadrado, Exame, além de fontes primárias (BCB, IBGE, FGV IBRE, Fipe, Abecip, B3).
Use a busca web. Se um portal não abrir por bloqueio de rede, registre isso nas Limitações e siga com a busca.
Lembre de feriados (sem pregão) e não use números de anos anteriores que apareçam nas buscas.

## 2. Confronto e checagem
Para cada notícia relevante:
1. Um número só é publicado com ≥2 fontes independentes ou fonte primária.
2. Classifique em FATO, EXAGERO, AINDA NÃO (intenção ≠ decisão), DIVERGE, NÃO VERIFICADO.
3. Troque adjetivos ("dispara", "derrete", "surpreende") pelo número.
4. Causa disputada: mostre as hipóteses lado a lado e indique qual veículo defende qual (viés editorial).
5. Separe a projeção (Focus, BC, casas) do dado realizado (IBGE, B3).

## 3. Entregáveis em `panorama/edicoes/AAAA-MM-DD/`
- `resumo.md` com quatro partes: resumo executivo focado no impacto imobiliário, tabela de confronto de fontes, limitações e fontes com links. Use a edição de 2026-11-21 como modelo.
- `conteudo.json` com **um único carrossel de 7 a 8 slides**, no mesmo formato da edição modelo. Tipos de slide: `capa`, `kpis`, `lista`, `barras`, `degraus`, `checagem`, `cta`. Fotos em `panorama/assets/` (fotos reais dos imóveis do Linhares; use `fotoPos` para enquadrar).
  - Sequência sugerida: capa → juros → dólar/fiscal → crédito/funding → preços → pontos de atenção → fato × ruído → leitura do Linhares.
- **Tom técnico, sereno e equilibrado:** linguagem de analista, sem alarmismo e sem otimismo de vendedor. Apresente cada risco com o contexto e o contraponto disponível (ex.: poupança cai, mas crédito cresce no ano). Prefira "em ajuste", "estável", "para acompanhar" a "piora", "dispara", "crise". Feche sempre com orientação prática e construtiva.
- Estilo: visual claro e limpo (o `render.js` já aplica). Textos **sem rodeios**: título de até 6 palavras, no máximo 2 números por slide de KPIs, descrições de 1 linha e texto de apoio de até 2 frases curtas.
- `reels.cenas` no JSON com no máximo 90 s no total, narração em primeira pessoa no tom do Linhares, números por extenso.
- Rode `node panorama/render.js panorama/edicoes/AAAA-MM-DD`. Ele gera `carrosseis/*.png` (1080×1350), `reels-panorama-AAAA-MM-DD.mp4` (1080×1920, trilha muda para a narração) e `roteiro-reels.txt`.
- Confira visualmente pelo menos um slide de cada carrossel (texto estourando o card, sobreposição).

## 4. Publicação
Faça commit e push no branch de trabalho. Termine com um resumo curto: as 3 manchetes do dia com impacto imobiliário e o caminho dos arquivos.
