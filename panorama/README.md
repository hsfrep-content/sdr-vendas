# Panorama do Dia — @linharesm2

Gerador diário de conteúdo sobre economia e mercado imobiliário: varredura de notícias, confronto de fontes, resumo, um carrossel objetivo de 7–8 slides para o Instagram e um Reels de até 90 s.

```
panorama/
├── ROTINA.md            # passo a passo que a tarefa agendada segue todo dia
├── render.js            # conteudo.json → carrosséis PNG + Reels MP4
├── assets/              # fotos reais dos imóveis (do Google Drive)
└── edicoes/AAAA-MM-DD/
    ├── resumo.md            # análise + checagem de vieses + fontes
    ├── conteudo.json        # textos dos slides e roteiro do Reels
    ├── carrosseis/c1-1.png … c1-8.png   (1080×1350)
    ├── reels/cena-XX.png    # quadros do Reels
    ├── reels-panorama-AAAA-MM-DD.mp4    (1080×1920, ≤90 s)
    └── roteiro-reels.txt    # fala com marcação de tempo
```

Gerar manualmente: `node panorama/render.js panorama/edicoes/2026-11-21` (requer Playwright/Chromium e ffmpeg).

## Narração com a sua voz
O MP4 sai **com trilha muda e legendas**, cronometrado pelo `roteiro-reels.txt`. Para narrar:
- **Gravando:** leia o roteiro (cada bloco tem a duração da tela) e substitua o áudio no CapCut/Instagram.
- **Voz clonada (automático):** conecte um serviço de clonagem de voz (ex.: ElevenLabs) com uma amostra autorizada da sua voz. O `render.js` pode então gerar o áudio de cada cena e mixar no MP4.

## Rede
Os portais Valor, O Globo, Gazeta do Povo, BandNews, CNN Brasil, InfoMoney e Investing estão bloqueados para leitura direta no ambiente atual. A rotina usa a busca web. Para ler direto da fonte, libere esses domínios na configuração de rede do ambiente.
