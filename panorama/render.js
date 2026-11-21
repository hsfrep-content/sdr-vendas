#!/usr/bin/env node
// Gera os carrosséis (1080x1350) e o Reels (1080x1920, MP4) do Panorama do Dia @linharesm2
// Uso: node panorama/render.js panorama/edicoes/AAAA-MM-DD
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const dir = path.resolve(process.argv[2] || '');
const conteudoPath = path.join(dir, 'conteudo.json');
if (!fs.existsSync(conteudoPath)) {
  console.error('Uso: node panorama/render.js panorama/edicoes/AAAA-MM-DD  (precisa de conteudo.json)');
  process.exit(1);
}
const C = JSON.parse(fs.readFileSync(conteudoPath, 'utf8'));
const ASSETS = path.join(__dirname, 'assets');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataUri = (file) => {
  const p = path.join(ASSETS, file);
  return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
};

// Identidade: foto real ao fundo, card escuro translúcido, acento terracota, tipografia branca em negrito.
const ACENTO = '#C8632C';
const ICONES = {
  termometro: `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="1.8" stroke-linecap="round"><path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 9v8"/></svg>`,
  moeda: `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.4 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.1-1.6M12 6v1.7M12 16.5V18"/></svg>`,
  cofre: `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v-.5M6 19v1.5M18 19v1.5"/></svg>`,
  casa: `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="2" stroke-linecap="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
};

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;font-family:Inter,'Inter Display',Arial,sans-serif;color:#fff;background:#121416;overflow:hidden}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.bg.blur{filter:blur(14px) brightness(.55);transform:scale(1.12)}
.bg.sharp{filter:brightness(.62) saturate(1.05)}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,14,.35) 0%,rgba(10,12,14,.15) 40%,rgba(10,12,14,.85) 100%)}
.top{position:absolute;top:56px;left:64px;right:64px;display:flex;justify-content:space-between;align-items:center;font-size:24px;letter-spacing:.14em;font-weight:600;opacity:.92}
.brand{display:flex;align-items:center;gap:12px;white-space:nowrap}
.top svg{width:34px;height:34px}
.brand b{color:${ACENTO}}
.card{position:absolute;left:64px;right:64px;background:rgba(22,24,28,.74);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.10);border-radius:28px;padding:56px 60px}
.tag{display:flex;align-items:center;gap:14px;font-size:24px;letter-spacing:.16em;font-weight:600;color:#E9E6E1;text-transform:uppercase}
.tag svg{width:34px;height:34px}
h1{font-size:76px;line-height:1.04;font-weight:800;letter-spacing:-.02em;margin-top:26px}
h2{font-size:58px;line-height:1.08;font-weight:800;letter-spacing:-.015em;margin-top:22px}
.bar{width:84px;height:6px;background:${ACENTO};border-radius:3px;margin:30px 0 26px}
.sub{font-size:34px;line-height:1.35;color:#E4E1DC;font-weight:400}
.txt{font-size:31px;line-height:1.42;color:#E4E1DC}
.kpis{display:grid;gap:22px;margin:6px 0 34px}
.kpi{display:flex;align-items:baseline;gap:26px;border-bottom:1px solid rgba(255,255,255,.10);padding-bottom:20px}
.kpi .v{font-size:66px;font-weight:800;color:#fff;min-width:330px;letter-spacing:-.02em}
.kpi .r{font-size:28px;color:#CFCBC5}
.kpi:first-child .v{color:${ACENTO}}
.pill{display:inline-flex;align-items:baseline;gap:10px;background:${ACENTO};border-radius:14px;padding:14px 28px;font-size:30px;font-weight:700;margin-top:34px}
.foot{position:absolute;left:64px;right:64px;bottom:52px;display:flex;justify-content:space-between;font-size:24px;color:#D9D5CF;letter-spacing:.04em}
.foot .pg{font-weight:700;color:#fff}
.fonte{font-size:22px;color:#AFAAA3;margin-top:22px}
.icon-big{position:absolute;right:56px;top:56px;width:92px;height:92px;opacity:.95}
.lista{display:grid;gap:30px;margin-top:6px}
.li{display:grid;grid-template-columns:54px 1fr;gap:18px;align-items:start}
.li .n{width:54px;height:54px;border-radius:50%;background:${ACENTO};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px}
.li .t{font-size:36px;font-weight:700;line-height:1.2}
.li .d{font-size:28px;line-height:1.4;color:#D6D2CC;margin-top:6px}
.barras{display:grid;gap:30px;margin:10px 0 34px}
.br .lab{display:flex;justify-content:space-between;font-size:28px;color:#DAD6D0;margin-bottom:12px}
.br .lab b{font-size:40px;color:#fff}
.br .trk{height:40px;border-radius:12px;background:rgba(255,255,255,.08);overflow:hidden}
.br .fil{height:100%;border-radius:12px;background:rgba(255,255,255,.42)}
.br.hi .fil{background:${ACENTO}}
.br.hi .lab b{color:${ACENTO}}
.degraus{display:flex;align-items:flex-end;gap:28px;height:430px;margin:8px 0 34px;border-bottom:2px solid rgba(255,255,255,.2)}
.dg{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.dg .col{width:100%;border-radius:16px 16px 0 0;background:rgba(255,255,255,.36)}
.dg:first-child .col{background:${ACENTO}}
.dg .v{font-size:44px;font-weight:800;margin-bottom:14px}
.dg .a{font-size:26px;color:#CFCBC5;margin-top:14px;position:relative;top:56px}
.chk{display:grid;gap:22px;margin-top:8px}
.ck{display:grid;grid-template-columns:200px 1fr;gap:22px;align-items:start;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:20px}
.selo{font-size:22px;font-weight:800;letter-spacing:.1em;text-align:center;border-radius:10px;padding:10px 0}
.selo.FATO{background:#2F7D4F}.selo.EXAGERO{background:${ACENTO}}.selo.AINDA{background:#8A6D1F}.selo.DIVERGE{background:#5A5F6B}
.ck .t{font-size:31px;font-weight:700;line-height:1.2}
.ck .d{font-size:25px;color:#D3CFC9;line-height:1.38;margin-top:6px}
`;

function topo() {
  return `<div class="top"><div class="brand">${ICONES.pin}<span>LINHARES <b>·</b> m²</span></div><div>${esc(C.dataExtenso.split(',')[1] || C.data).trim().toUpperCase()}</div></div>`;
}

function rodape(slide, idx, total) {
  return `<div class="foot"><span>${esc(slide.rodape || C.handle)}</span><span class="pg">${idx}/${total}</span></div>`;
}

function slideHTML(slide, idx, total) {
  const fundo = slide.fundo || C.fundos[(idx + 1) % C.fundos.length];
  const sharp = ['capa', 'cta'].includes(slide.tipo);
  let corpo = '';
  const tag = `<div class="tag">${slide.icone ? ICONES[slide.icone] : ICONES.pin}<span>${esc(slide.tag)}</span></div>`;

  if (slide.tipo === 'capa' || slide.tipo === 'cta') {
    corpo = `<div class="card" style="bottom:140px">${tag}<h1>${esc(slide.titulo)}</h1><div class="bar"></div><div class="sub">${esc(slide.subtitulo)}</div>
      ${slide.tipo === 'cta' ? `<div class="pill">Simule comigo · ${esc(C.handle)}</div>` : ''}</div>`;
  } else if (slide.tipo === 'kpis') {
    corpo = `<div class="card" style="top:170px">${slide.icone ? `<div class="icon-big">${ICONES[slide.icone]}</div>` : ''}
      ${tag}<h2>${esc(slide.titulo)}</h2><div class="bar"></div>
      <div class="kpis">${slide.kpis.map((k) => `<div class="kpi"><span class="v">${esc(k.valor)}</span><span class="r">${esc(k.rotulo)}</span></div>`).join('')}</div>
      <div class="txt">${esc(slide.texto)}</div></div>`;
  } else if (slide.tipo === 'lista') {
    corpo = `<div class="card" style="top:170px">${slide.icone ? `<div class="icon-big">${ICONES[slide.icone]}</div>` : ''}
      ${tag}<h2>${esc(slide.titulo)}</h2><div class="bar"></div>
      <div class="lista">${slide.itens.map((it, i) => `<div class="li"><div class="n">${i + 1}</div><div><div class="t">${esc(it.t)}</div><div class="d">${esc(it.d)}</div></div></div>`).join('')}</div></div>`;
  } else if (slide.tipo === 'barras') {
    const max = Math.max(...slide.barras.map((b) => b.valor)) * 1.08;
    corpo = `<div class="card" style="top:170px">${tag}<h2>${esc(slide.titulo)}</h2><div class="bar"></div>
      <div class="barras">${slide.barras.map((b) => `<div class="br ${b.destaque ? 'hi' : ''}"><div class="lab"><span>${esc(b.rotulo)}</span><b>${esc(b.txt)}</b></div><div class="trk"><div class="fil" style="width:${((b.valor / max) * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>
      <div class="txt">${esc(slide.texto)}</div>${slide.fonte ? `<div class="fonte">${esc(slide.fonte)}</div>` : ''}</div>`;
  } else if (slide.tipo === 'degraus') {
    const max = Math.max(...slide.degraus.map((d) => d.valor));
    const min = Math.min(...slide.degraus.map((d) => d.valor)) * 0.8;
    corpo = `<div class="card" style="top:170px">${tag}<h2>${esc(slide.titulo)}</h2><div class="bar"></div>
      <div class="degraus">${slide.degraus.map((d) => `<div class="dg"><div class="v">${esc(d.rotulo)}</div><div class="col" style="height:${(((d.valor - min) / (max - min)) * 70 + 25).toFixed(1)}%"></div><div class="a">${esc(d.ano)}</div></div>`).join('')}</div>
      <div class="txt" style="margin-top:70px">${esc(slide.texto)}</div>${slide.fonte ? `<div class="fonte">${esc(slide.fonte)}</div>` : ''}</div>`;
  } else if (slide.tipo === 'checagem') {
    corpo = `<div class="card" style="top:170px">${tag}<h2>${esc(slide.titulo)}</h2><div class="bar"></div>
      <div class="chk">${slide.itens.map((it) => `<div class="ck"><div class="selo ${esc(it.selo.split(' ')[0])}">${esc(it.selo)}</div><div><div class="t">${esc(it.t)}</div><div class="d">${esc(it.d)}</div></div></div>`).join('')}</div></div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="bg ${sharp ? 'sharp' : 'blur'}" style="background-image:url('${dataUri(fundo)}')"></div><div class="shade"></div>
    ${topo()}${corpo}${rodape(slide, idx, total)}</body></html>`;
}

function reelsFrameHTML(slidePng, fala, fundo) {
  // Moldura vertical 1080x1920: slide do feed + legenda da narração.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:1080px;height:1920px;overflow:hidden;background:#101214;font-family:Inter,Arial,sans-serif;color:#fff}
    .bg{position:absolute;inset:0;background:url('${dataUri(fundo)}') center/cover;filter:blur(26px) brightness(.35);transform:scale(1.2)}
    .slide{position:absolute;top:150px;left:0;width:1080px;height:1350px;background:url('data:image/png;base64,${slidePng}') center/cover}
    .leg{position:absolute;left:60px;right:60px;top:1540px;font-size:44px;line-height:1.32;font-weight:700;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.6)}
    .h{position:absolute;top:60px;left:0;right:0;text-align:center;font-size:30px;letter-spacing:.18em;font-weight:700}
    .h b{color:${ACENTO}}
  </style></head><body><div class="bg"></div><div class="h">PANORAMA DO DIA <b>·</b> ${esc(C.handle.toUpperCase())}</div><div class="slide"></div><div class="leg">${esc(fala)}</div></body></html>`;
}

(async () => {
  const outCar = path.join(dir, 'carrosseis');
  const outReels = path.join(dir, 'reels');
  fs.mkdirSync(outCar, { recursive: true });
  fs.mkdirSync(outReels, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const pngs = {};

  for (const car of C.carrosseis) {
    for (let i = 0; i < car.slides.length; i++) {
      const s = car.slides[i];
      await page.setContent(slideHTML(s, i + 1, car.slides.length), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(outCar, `${car.id}-${i + 1}.png`);
      await page.screenshot({ path: file });
      pngs[`${car.id}-${i + 1}`] = { file, fundo: s.fundo || C.fundos[(i + 2) % C.fundos.length] };
      console.log('slide', path.relative(process.cwd(), file));
    }
  }

  // Reels
  const rp = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const clips = [];
  let roteiro = `ROTEIRO DO REELS — ${C.dataExtenso}\nDuração alvo: ${C.reels.duracaoAlvo}s\n\n`;
  let t = 0;
  for (let i = 0; i < C.reels.cenas.length; i++) {
    const cena = C.reels.cenas[i];
    const ref = pngs[cena.slide];
    if (!ref) throw new Error(`Cena ${i + 1}: slide ${cena.slide} não existe`);
    await rp.setContent(reelsFrameHTML(fs.readFileSync(ref.file).toString('base64'), cena.fala, ref.fundo), { waitUntil: 'load' });
    await rp.evaluate(() => document.fonts.ready);
    const frame = path.join(outReels, `cena-${String(i + 1).padStart(2, '0')}.png`);
    await rp.screenshot({ path: frame });
    const clip = path.join(outReels, `cena-${String(i + 1).padStart(2, '0')}.mp4`);
    // Leve zoom (Ken Burns) + fade de entrada e saída
    const fr = 30, n = cena.seg * fr;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', frame,
      '-vf', `scale=1188:2112,zoompan=z='min(1+0.0006*on,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=1080x1920:fps=${fr},fade=t=in:st=0:d=0.35,fade=t=out:st=${cena.seg - 0.35}:d=0.35,format=yuv420p`,
      '-t', String(cena.seg), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', clip]);
    clips.push(clip);
    const mm = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    roteiro += `[${mm(t)}–${mm(t + cena.seg)}] (${cena.seg}s · tela ${cena.slide})\n${cena.fala}\n\n`;
    t += cena.seg;
  }
  await browser.close();

  const lista = path.join(outReels, 'lista.txt');
  fs.writeFileSync(lista, clips.map((c) => `file '${c}'`).join('\n'));
  const mp4 = path.join(dir, `reels-panorama-${C.data}.mp4`);
  // Trilha silenciosa para a narração ser adicionada por cima (Instagram exige faixa de áudio)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', mp4]);
  for (const c of clips) fs.unlinkSync(c);
  fs.unlinkSync(lista);

  roteiro += `Total: ${t}s\n`;
  fs.writeFileSync(path.join(dir, 'roteiro-reels.txt'), roteiro);
  console.log('reels', path.relative(process.cwd(), mp4), `${t}s`);
})().catch((e) => { console.error(e); process.exit(1); });
