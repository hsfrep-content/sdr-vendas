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
  const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
};

// Identidade (tema claro): fundo off-white, muito respiro, foto só na capa, acento terracota.
const ACENTO = '#C8632C';
const COR = { fundo: '#F6F4F0', texto: '#1C1F23', suave: '#62666D', linha: '#E3DFD8', acentoClaro: '#F6E8DE' };
const ic = (d, sw = 1.7) => `<svg viewBox="0 0 24 24" fill="none" stroke="${ACENTO}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONES = {
  termometro: ic('<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 9v8"/>'),
  moeda: ic('<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.4 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.1-1.6M12 6v1.7M12 16.5V18"/>'),
  cofre: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 19v1.5M18 19v1.5"/>'),
  casa: ic('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  check: ic('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>'),
  grafico: ic('<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>'),
  lupa: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  pin: ic('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', 2),
};

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;font-family:Inter,'Inter Display',Arial,sans-serif;color:${COR.texto};background:${COR.fundo};overflow:hidden}
.top{position:absolute;top:60px;left:80px;right:80px;display:flex;justify-content:space-between;align-items:center;font-size:22px;letter-spacing:.16em;font-weight:600;color:${COR.suave}}
.brand{display:flex;align-items:center;gap:10px;white-space:nowrap;color:${COR.texto}}
.brand svg{width:28px;height:28px}
.brand b{color:${ACENTO}}
.wrap{position:absolute;left:80px;right:80px;top:200px}
.foto{position:absolute;left:80px;right:80px;top:140px;height:600px;border-radius:36px;background-size:cover;background-position:center}
.tag{font-size:22px;letter-spacing:.18em;font-weight:700;color:${ACENTO};text-transform:uppercase}
.ico{position:absolute;right:0;top:-8px;width:56px;height:56px}
.wrap.mid{top:50%;transform:translateY(-46%)}
h1{font-size:68px;line-height:1.08;font-weight:800;letter-spacing:-.025em;margin-top:22px}
h2{font-size:60px;line-height:1.1;font-weight:800;letter-spacing:-.02em;margin-top:20px;max-width:820px}
.bar{width:56px;height:5px;background:${ACENTO};border-radius:3px;margin:36px 0 44px}
.sub{font-size:32px;line-height:1.45;color:${COR.suave};margin-top:24px}
.txt{font-size:30px;line-height:1.5;color:${COR.suave};margin-top:48px}
.kpis{display:grid}
.kpi{display:flex;align-items:baseline;justify-content:space-between;gap:30px;padding:30px 0;border-top:1.5px solid ${COR.linha}}
.kpi:last-child{border-bottom:1.5px solid ${COR.linha}}
.kpi .v{font-size:72px;font-weight:800;letter-spacing:-.03em}
.kpi .r{font-size:27px;color:${COR.suave};text-align:right}
.kpi:first-child .v{color:${ACENTO}}
.pill{display:inline-block;background:${ACENTO};color:#fff;border-radius:999px;padding:20px 40px;font-size:28px;font-weight:700;margin-top:44px}
.foot{position:absolute;left:80px;right:80px;bottom:60px;display:flex;justify-content:space-between;font-size:22px;color:${COR.suave};letter-spacing:.04em}
.dots{display:flex;gap:10px;align-items:center}
.dots i{width:10px;height:10px;border-radius:50%;background:${COR.linha}}
.dots i.on{width:30px;border-radius:5px;background:${ACENTO}}
.fonte{font-size:21px;color:#9A9690;margin-top:28px}
.lista{display:grid}
.li{display:grid;grid-template-columns:64px 1fr;gap:24px;padding:30px 0;border-top:1.5px solid ${COR.linha}}
.li .n{width:52px;height:52px;border-radius:50%;background:${COR.acentoClaro};color:${ACENTO};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px}
.li .t{font-size:36px;font-weight:700;line-height:1.2}
.li .d{font-size:28px;line-height:1.45;color:${COR.suave};margin-top:8px}
.barras{display:grid;gap:40px}
.br .lab{display:flex;justify-content:space-between;align-items:baseline;font-size:28px;color:${COR.suave};margin-bottom:14px}
.br .lab b{font-size:44px;color:${COR.texto};font-weight:800}
.br .trk{height:22px;border-radius:11px;background:#ECE8E2;overflow:hidden}
.br .fil{height:100%;border-radius:11px;background:#C9C3BA}
.br.hi .fil{background:${ACENTO}}
.br.hi .lab b{color:${ACENTO}}
.degraus{display:flex;align-items:flex-end;gap:36px;height:420px}
.dg{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.dg .col{width:100%;border-radius:20px;background:#DDD8D0}
.dg:first-child .col{background:${ACENTO}}
.dg .v{font-size:44px;font-weight:800;margin-bottom:16px}
.anos{display:flex;gap:36px;margin-top:18px}
.anos span{flex:1;text-align:center;font-size:25px;color:${COR.suave}}
.chk{display:grid}
.ck{display:grid;grid-template-columns:190px 1fr;gap:28px;align-items:start;padding:28px 0;border-top:1.5px solid ${COR.linha}}
.selo{font-size:19px;font-weight:800;letter-spacing:.12em;text-align:center;border-radius:999px;padding:11px 0}
.selo.FATO{background:#E2F0E7;color:#2C7A4B}.selo.EXAGERO{background:${COR.acentoClaro};color:${ACENTO}}
.selo.AINDA{background:#F5EEDA;color:#86691A}.selo.DIVERGE{background:#E9EAED;color:#555A63}
.ck .t{font-size:32px;font-weight:700;line-height:1.2}
.ck .d{font-size:26px;color:${COR.suave};line-height:1.45;margin-top:6px}
`;

function topo() {
  return `<div class="top"><div class="brand">${ICONES.pin}<span>LINHARES <b>·</b> m²</span></div><div>${esc(C.dataExtenso.split(',')[1] || C.data).trim().toUpperCase()}</div></div>`;
}

function rodape(slide, idx, total) {
  const dots = Array.from({ length: total }, (_, i) => `<i class="${i + 1 === idx ? 'on' : ''}"></i>`).join('');
  return `<div class="foot"><span>${esc(slide.rodape || C.handle)}</span><span class="dots">${dots}</span></div>`;
}

function slideHTML(slide, idx, total) {
  const fundo = slide.fundo || C.fundos[(idx + 1) % C.fundos.length];
  let corpo = '';
  const cab = `${slide.icone ? `<div class="ico">${ICONES[slide.icone]}</div>` : ''}<div class="tag">${esc(slide.tag)}</div><h2>${esc(slide.titulo)}</h2><div class="bar"></div>`;
  const fonte = slide.fonte ? `<div class="fonte">${esc(slide.fonte)}</div>` : '';

  if (slide.tipo === 'capa' || slide.tipo === 'cta') {
    corpo = `<div class="foto" style="background-image:url('${dataUri(fundo)}');background-position:${slide.fotoPos || 'center'}"></div>
      <div class="wrap" style="top:800px"><div class="tag">${esc(slide.tag)}</div><h1>${esc(slide.titulo)}</h1><div class="sub">${esc(slide.subtitulo)}</div>
      ${slide.tipo === 'cta' ? `<div class="pill">Simule comigo · ${esc(C.handle)}</div>` : ''}</div>`;
  } else if (slide.tipo === 'kpis') {
    corpo = `<div class="wrap mid">${cab}<div class="kpis">${slide.kpis.map((k) => `<div class="kpi"><span class="v">${esc(k.valor)}</span><span class="r">${esc(k.rotulo)}</span></div>`).join('')}</div>
      <div class="txt">${esc(slide.texto)}</div>${fonte}</div>`;
  } else if (slide.tipo === 'lista') {
    corpo = `<div class="wrap mid">${cab}<div class="lista">${slide.itens.map((it, i) => `<div class="li"><div class="n">${i + 1}</div><div><div class="t">${esc(it.t)}</div><div class="d">${esc(it.d)}</div></div></div>`).join('')}</div>${fonte}</div>`;
  } else if (slide.tipo === 'barras') {
    const max = Math.max(...slide.barras.map((b) => b.valor)) * 1.05;
    corpo = `<div class="wrap mid">${cab}<div class="barras">${slide.barras.map((b) => `<div class="br ${b.destaque ? 'hi' : ''}"><div class="lab"><span>${esc(b.rotulo)}</span><b>${esc(b.txt)}</b></div><div class="trk"><div class="fil" style="width:${((b.valor / max) * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>
      <div class="txt">${esc(slide.texto)}</div>${fonte}</div>`;
  } else if (slide.tipo === 'degraus') {
    const max = Math.max(...slide.degraus.map((d) => d.valor));
    const min = Math.min(...slide.degraus.map((d) => d.valor)) * 0.8;
    corpo = `<div class="wrap mid">${cab}<div class="degraus">${slide.degraus.map((d) => `<div class="dg"><div class="v">${esc(d.rotulo)}</div><div class="col" style="height:${(((d.valor - min) / (max - min)) * 65 + 20).toFixed(1)}%"></div></div>`).join('')}</div>
      <div class="anos">${slide.degraus.map((d) => `<span>${esc(d.ano)}</span>`).join('')}</div>
      <div class="txt">${esc(slide.texto)}</div>${fonte}</div>`;
  } else if (slide.tipo === 'checagem') {
    corpo = `<div class="wrap mid">${cab}<div class="chk">${slide.itens.map((it) => `<div class="ck"><div class="selo ${esc(it.selo.split(' ')[0])}">${esc(it.selo)}</div><div><div class="t">${esc(it.t)}</div><div class="d">${esc(it.d)}</div></div></div>`).join('')}</div>${fonte}</div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${topo()}${corpo}${rodape(slide, idx, total)}</body></html>`;
}

function reelsFrameHTML(slidePng, fala) {
  // Moldura vertical 1080x1920 clara: slide do feed + legenda da narração.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:1080px;height:1920px;overflow:hidden;background:${COR.fundo};font-family:Inter,Arial,sans-serif;color:${COR.texto}}
    .slide{position:absolute;top:150px;left:0;width:1080px;height:1350px;background:url('data:image/png;base64,${slidePng}') center/cover;border-top:1.5px solid ${COR.linha};border-bottom:1.5px solid ${COR.linha}}
    .leg{position:absolute;left:80px;right:80px;top:1560px;font-size:42px;line-height:1.38;font-weight:600;text-align:center}
    .h{position:absolute;top:62px;left:0;right:0;text-align:center;font-size:26px;letter-spacing:.2em;font-weight:700;color:${COR.suave}}
    .h b{color:${ACENTO}}
  </style></head><body><div class="h">PANORAMA DO DIA <b>·</b> ${esc(C.handle.toUpperCase())}</div><div class="slide"></div><div class="leg">${esc(fala)}</div></body></html>`;
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
    await rp.setContent(reelsFrameHTML(fs.readFileSync(ref.file).toString('base64'), cena.fala), { waitUntil: 'load' });
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
