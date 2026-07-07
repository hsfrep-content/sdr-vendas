// Gerador do mini blog estático de noticias.aelimoveis.com.br.
//
// Renderiza apenas posts com status "Publicar". Identidade visual A&L:
// fundo claro, tipografia elegante, azul-marinho, branco, cinza e detalhes
// discretos em vermelho. Um boletim de inteligência imobiliária, não um
// portal genérico.
//
// Páginas: / /noticias /selic-juros /mercado-imobiliario /credito-imobiliario
// /inflacao /indicadores /sobre /politica-editorial /fontes
// + uma página por post, feed.xml, sitemap.xml, robots.txt e CNAME.

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { FONTES } = require('../../config/fontes');
const { formatarDataHoraBR } = require('../lib/texto');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const DOMINIO = 'https://noticias.aelimoveis.com.br';

const AVISO_EDITORIAL =
  'As análises publicadas neste boletim têm caráter exclusivamente informativo e editorial. ' +
  'A A&L | Negócios Imobiliários não presta recomendação de investimento financeiro. ' +
  'A decisão de compra, venda, locação ou investimento imobiliário deve considerar o perfil, ' +
  'o momento e a documentação de cada operação.';

const SECOES = [
  { rota: '/', titulo: 'Início' },
  { rota: '/noticias/', titulo: 'Notícias e análises' },
  { rota: '/selic-juros/', titulo: 'Selic e juros', categorias: ['Selic e Juros', 'Economia'] },
  { rota: '/mercado-imobiliario/', titulo: 'Mercado imobiliário', categorias: ['Mercado Imobiliário', 'Fundos Imobiliários', 'Construção Civil', 'Mercado Nacional'] },
  { rota: '/credito-imobiliario/', titulo: 'Crédito imobiliário', categorias: ['Crédito Imobiliário'] },
  { rota: '/inflacao/', titulo: 'Inflação', categorias: ['Inflação'] },
  { rota: '/indicadores/', titulo: 'Indicadores' },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
:root{--navy:#14263f;--navy-2:#1e3a5f;--red:#b3282d;--ink:#2b3440;--muted:#6b7684;--line:#e3e7ec;--bg:#f7f8fa;--card:#ffffff}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,'Times New Roman',serif;background:var(--bg);color:var(--ink);line-height:1.65}
.sans{font-family:'Helvetica Neue',Arial,sans-serif}
a{color:var(--navy-2);text-decoration:none}a:hover{text-decoration:underline}
header.topo{background:var(--navy);color:#fff;padding:26px 0;border-bottom:3px solid var(--red)}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}
.marca{font-size:1.5rem;letter-spacing:.02em}.marca b{font-weight:700}.marca span{color:#c9d3e0;font-size:.95rem}
.tagline{color:#aebacc;font-size:.85rem;margin-top:4px;font-family:'Helvetica Neue',Arial,sans-serif}
nav.menu{background:#fff;border-bottom:1px solid var(--line);font-family:'Helvetica Neue',Arial,sans-serif}
nav.menu .wrap{display:flex;flex-wrap:wrap;gap:2px}
nav.menu a{padding:12px 14px;font-size:.85rem;color:var(--ink);text-transform:uppercase;letter-spacing:.06em}
nav.menu a:hover,nav.menu a.ativo{color:var(--red);text-decoration:none;border-bottom:2px solid var(--red)}
main{padding:36px 0 60px}
h1{font-size:1.9rem;color:var(--navy);margin-bottom:8px;font-weight:600}
h2{font-size:1.25rem;color:var(--navy);margin:28px 0 12px}
.sub{color:var(--muted);font-size:.95rem;margin-bottom:26px}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:22px 24px;margin-bottom:18px}
.card h3{font-size:1.15rem;color:var(--navy);margin-bottom:6px;font-weight:600}
.card h3 a{color:var(--navy)}
.meta{font-family:'Helvetica Neue',Arial,sans-serif;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.meta .cat{color:var(--red);font-weight:600}
.destaque{border-left:4px solid var(--red)}
.leitura{background:#f2f4f7;border-left:3px solid var(--navy);padding:14px 18px;margin:18px 0;border-radius:0 4px 4px 0}
.leitura b{color:var(--navy)}
.fontes{font-size:.85rem;color:var(--muted);margin-top:14px;font-family:'Helvetica Neue',Arial,sans-serif}
.tags{margin-top:10px}.tags span{display:inline-block;background:#eef1f5;color:var(--navy-2);font-size:.72rem;padding:3px 10px;border-radius:12px;margin-right:6px;font-family:'Helvetica Neue',Arial,sans-serif}
table.ind{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);font-family:'Helvetica Neue',Arial,sans-serif;font-size:.9rem}
table.ind th,table.ind td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line)}
table.ind th{background:var(--navy);color:#fff;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
table.ind td.v{font-weight:700;color:var(--navy)}
.grade{display:grid;grid-template-columns:2fr 1fr;gap:24px}
@media(max-width:760px){.grade{grid-template-columns:1fr}}
aside .card{padding:16px 18px}
aside h4{font-family:'Helvetica Neue',Arial,sans-serif;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--red);margin-bottom:10px}
aside ul{list-style:none}aside li{padding:5px 0;border-bottom:1px dotted var(--line);font-size:.9rem}
footer{background:var(--navy);color:#c9d3e0;padding:30px 0;font-size:.82rem;font-family:'Helvetica Neue',Arial,sans-serif}
footer .aviso{border-top:1px solid #2c4363;margin-top:14px;padding-top:14px;color:#93a3ba;font-style:italic;line-height:1.6}
.post-body{font-size:1.05rem}.post-body p{margin-bottom:14px}
.vazio{color:var(--muted);font-style:italic;padding:30px 0}
`;

function layout({ titulo, descricao, rota, corpo }) {
  const nav = SECOES.map(
    (s) => `<a href="${s.rota}" class="${s.rota === rota ? 'ativo' : ''}">${esc(s.titulo)}</a>`
  ).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · Boletim A&amp;L</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${DOMINIO}${rota}">
<link rel="alternate" type="application/rss+xml" title="Boletim A&amp;L" href="${DOMINIO}/feed.xml">
<style>${CSS}</style>
</head>
<body>
<header class="topo"><div class="wrap">
  <div class="marca"><b>A&amp;L</b> <span>| Negócios Imobiliários</span></div>
  <div class="tagline">Boletim de inteligência imobiliária — economia, juros e mercado, interpretados para quem compra, vende e investe.</div>
</div></header>
<nav class="menu"><div class="wrap">${nav}<a href="/sobre/">Sobre</a><a href="/fontes/">Fontes</a></div></nav>
<main><div class="wrap">
${corpo}
</div></main>
<footer><div class="wrap">
  <div>A&amp;L | Negócios Imobiliários · Zona Sul do Recife — Pina, Boa Viagem, Setúbal, Piedade, Candeias e Paiva.</div>
  <div><a href="/politica-editorial/" style="color:#c9d3e0">Política editorial</a> · <a href="/fontes/" style="color:#c9d3e0">Fontes monitoradas</a> · <a href="/feed.xml" style="color:#c9d3e0">RSS</a></div>
  <div class="aviso">${esc(AVISO_EDITORIAL)}</div>
</div></footer>
</body>
</html>`;
}

function cardPost(p, { destaque = false } = {}) {
  return `<article class="card ${destaque ? 'destaque' : ''}">
  <div class="meta"><span class="cat">${esc(p.categoria)}</span> · ${esc(formatarDataHoraBR(new Date(p.dataPublicacao)))} · rodada da ${p.rodada === 'manha' ? 'manhã' : 'noite'}</div>
  <h3><a href="/noticias/${esc(p.slug)}/">${esc(p.tituloEditorial)}</a></h3>
  <p>${esc(p.metaDescription)}</p>
</article>`;
}

function paginaPost(p) {
  const paragrafos = String(p.textoFinal)
    .split(/\n{2,}/)
    .map((x) => `<p>${esc(x)}</p>`)
    .join('\n');
  const corpo = `
<article class="card post-body">
  <div class="meta"><span class="cat">${esc(p.categoria)}</span> · ${esc(formatarDataHoraBR(new Date(p.dataPublicacao)))} · rodada da ${p.rodada === 'manha' ? 'manhã' : 'noite'}</div>
  <h1>${esc(p.tituloEditorial)}</h1>
  ${paragrafos}
  <div class="leitura"><b>Leitura A&amp;L:</b> ${esc(p.leituraAEL)}</div>
  <div class="fontes"><b>Fontes:</b> ${esc(p.fontes.join(', '))}${p.urlOriginal ? ` · <a href="${esc(p.urlOriginal)}" rel="nofollow noopener" target="_blank">matéria de referência</a>` : ''}</div>
  <div class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
</article>
<p class="sub">Análise informativa da A&amp;L | Negócios Imobiliários. Não constitui recomendação de investimento.</p>`;
  return layout({ titulo: p.tituloEditorial, descricao: p.metaDescription, rota: `/noticias/${p.slug}/`, corpo });
}

function listaPosts(posts, { titulo, descricao, rota }) {
  const corpo = `
<h1>${esc(titulo)}</h1>
<p class="sub">${esc(descricao)}</p>
${posts.length ? posts.map((p) => cardPost(p)).join('\n') : '<p class="vazio">Ainda não há análises publicadas nesta seção. O boletim é atualizado às 08h e às 22h.</p>'}`;
  return layout({ titulo, descricao, rota, corpo });
}

function tabelaIndicadores(ind) {
  if (!ind || !ind.itens || ind.itens.length === 0) {
    return '<p class="vazio">Indicadores serão exibidos após a primeira coleta junto ao Banco Central.</p>';
  }
  const linhas = ind.itens
    .map((i) => `<tr><td>${esc(i.nome)}</td><td class="v">${esc(i.valor)}</td><td>${esc(i.data)}</td></tr>`)
    .join('');
  const focus = (ind.focus || [])
    .map((f) => `<tr><td>${esc(f.indicador)} (${esc(f.referencia)})</td><td class="v">${esc(f.mediana)}</td><td>${esc(f.data)}</td></tr>`)
    .join('');
  return `
<table class="ind"><thead><tr><th>Indicador oficial</th><th>Valor</th><th>Referência</th></tr></thead>
<tbody>${linhas}</tbody></table>
${focus ? `<h2>Expectativas do mercado (Boletim Focus — mediana)</h2>
<table class="ind"><thead><tr><th>Indicador (ano)</th><th>Mediana</th><th>Data do Focus</th></tr></thead><tbody>${focus}</tbody></table>` : ''}
<p class="sub" style="margin-top:14px">Fonte: Banco Central do Brasil (SGS e Sistema de Expectativas). Atualizado em ${esc(formatarDataHoraBR(new Date(ind.atualizadoEm)))}.</p>`;
}

function paginaInicial(publicados, ind) {
  const [destaque, ...resto] = publicados;
  const ultimas = resto.slice(0, 6);
  const corpo = `
<h1>Destaque do dia</h1>
<p class="sub">Leitura editorial da A&amp;L sobre economia, juros e mercado imobiliário. Atualizado às 08h e às 22h (Brasília).</p>
${destaque ? cardPost(destaque, { destaque: true }) : '<p class="vazio">A primeira edição do boletim será publicada na próxima rodada (08h ou 22h).</p>'}
<div class="grade">
  <section>
    <h2>Últimas análises</h2>
    ${ultimas.length ? ultimas.map((p) => cardPost(p)).join('\n') : '<p class="vazio">Sem outras análises por enquanto.</p>'}
  </section>
  <aside>
    <div class="card"><h4>Categorias</h4><ul>
      ${SECOES.filter((s) => s.categorias).map((s) => `<li><a href="${s.rota}">${esc(s.titulo)}</a></li>`).join('')}
    </ul></div>
    <div class="card"><h4>Indicadores acompanhados</h4><ul>
      ${(ind && ind.itens ? ind.itens : []).map((i) => `<li>${esc(i.nome)}: <b>${esc(i.valor)}</b></li>`).join('') || '<li>Selic, IPCA, IGP-M, INPC</li>'}
    </ul><p style="margin-top:8px;font-size:.8rem"><a href="/indicadores/">ver todos →</a></p></div>
    <div class="card"><h4>Fontes monitoradas</h4><ul>
      ${FONTES.filter((f) => f.prioridade === 'primaria').slice(0, 9).map((f) => `<li>${esc(f.nome)}</li>`).join('')}
    </ul><p style="margin-top:8px;font-size:.8rem"><a href="/fontes/">todas as fontes →</a></p></div>
  </aside>
</div>`;
  return layout({
    titulo: 'Boletim de inteligência imobiliária',
    descricao: 'Notícias e análises curtas sobre Selic, juros, inflação, crédito e mercado imobiliário, com a leitura consultiva da A&L | Negócios Imobiliários.',
    rota: '/',
    corpo,
  });
}

function paginaSobre() {
  const corpo = `
<h1>Sobre o boletim</h1>
<div class="card post-body">
<p>Este boletim é a área editorial da <b>A&amp;L | Negócios Imobiliários</b>, imobiliária com atuação na Zona Sul do Recife — Pina, Boa Viagem, Setúbal, Piedade, Candeias e Paiva.</p>
<p>Duas vezes por dia, às <b>08h</b> e às <b>22h</b> (horário de Brasília), um sistema editorial monitora fontes oficiais e a imprensa econômica, seleciona de um a três temas relevantes e publica análises curtas sobre Selic, juros, inflação, crédito imobiliário, construção civil e mercado de imóveis.</p>
<p>Cada publicação traz o bloco <b>Leitura A&amp;L</b>: a interpretação prática do tema para compradores, vendedores, proprietários e investidores — no tom sóbrio, técnico e consultivo que orienta o trabalho da marca.</p>
<p>O conteúdo é informativo. Não fazemos recomendação de investimento, não prometemos valorização e citamos sempre as fontes originais.</p>
</div>`;
  return layout({ titulo: 'Sobre o boletim', descricao: 'O que é o boletim de inteligência imobiliária da A&L | Negócios Imobiliários.', rota: '/sobre/', corpo });
}

function paginaPolitica() {
  const corpo = `
<h1>Política editorial</h1>
<div class="card post-body">
<h2>Princípios</h2>
<p>Sobriedade, precisão e utilidade. Diferenciamos fato de interpretação, indicamos quando uma informação é projeção e usamos linguagem prudente, sem sensacionalismo.</p>
<h2>Fontes e direitos autorais</h2>
<p>Coletamos apenas conteúdo público: RSS oficiais, APIs públicas (Banco Central, IBGE), Google News e páginas indexáveis. Não copiamos texto integral de matérias, não burlamos paywall e citamos a fonte original com link canônico em toda publicação. De veículos com paywall usamos apenas título, chamada pública e metadados.</p>
<h2>O que não fazemos</h2>
<p>Não fazemos recomendação de investimento, aconselhamento jurídico ou tributário, promessa de valorização de imóveis ou indução de compra e venda com base em previsões não verificadas. Não inventamos dados.</p>
<h2>Publicação e revisão</h2>
<p>Cada tema recebe um score de relevância (0–100). Somente conteúdo com score alto, fontes verificadas e aprovação nas checagens de conformidade é publicado automaticamente; o restante fica como rascunho para revisão humana. Mantemos histórico das fontes utilizadas e logs de coleta, seleção, publicação e rejeição.</p>
<h2>Aviso</h2>
<p><i>${esc(AVISO_EDITORIAL)}</i></p>
</div>`;
  return layout({ titulo: 'Política editorial', descricao: 'Princípios editoriais, uso de fontes e compliance do boletim A&L.', rota: '/politica-editorial/', corpo });
}

function paginaFontes() {
  const bloco = (titulo, fontes) => `
<h2>${esc(titulo)}</h2>
${fontes.map((f) => `<div class="card"><h3>${esc(f.nome)}</h3><p class="sub" style="margin:0">Coleta via ${f.tipo === 'rss' ? 'RSS oficial' : f.tipo.startsWith('api') ? 'API pública' : 'Google News RSS'}${f.paywall ? ' · veículo com paywall: usamos apenas título, chamada pública e metadados' : ''}.</p></div>`).join('\n')}`;
  const corpo = `
<h1>Fontes monitoradas</h1>
<p class="sub">Fontes varridas a cada rodada (08h e 22h). Dados oficiais têm sempre precedência sobre cobertura jornalística.</p>
${bloco('Fontes prioritárias', FONTES.filter((f) => f.prioridade === 'primaria'))}
${bloco('Fontes complementares (validação e contexto)', FONTES.filter((f) => f.prioridade === 'complementar'))}
<h2>Dados oficiais via API</h2>
<div class="card"><h3>Banco Central do Brasil</h3><p class="sub" style="margin:0">Séries SGS (Selic, IPCA, IGP-M, INPC) e Sistema de Expectativas (Boletim Focus).</p></div>`;
  return layout({ titulo: 'Fontes monitoradas', descricao: 'Lista de fontes oficiais e jornalísticas monitoradas pelo boletim A&L.', rota: '/fontes/', corpo });
}

function feedRss(publicados) {
  const itens = publicados
    .slice(0, 20)
    .map(
      (p) => `<item>
<title>${esc(p.tituloEditorial)}</title>
<link>${DOMINIO}/noticias/${esc(p.slug)}/</link>
<guid>${DOMINIO}/noticias/${esc(p.slug)}/</guid>
<pubDate>${new Date(p.dataPublicacao).toUTCString()}</pubDate>
<description>${esc(p.metaDescription)}</description>
<category>${esc(p.categoria)}</category>
</item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Boletim A&amp;L | Negócios Imobiliários</title>
<link>${DOMINIO}</link>
<description>Análises curtas sobre economia, juros e mercado imobiliário.</description>
<language>pt-br</language>
${itens}
</channel></rss>`;
}

function sitemap(publicados) {
  const rotas = [
    '/', '/noticias/', '/selic-juros/', '/mercado-imobiliario/', '/credito-imobiliario/',
    '/inflacao/', '/indicadores/', '/sobre/', '/politica-editorial/', '/fontes/',
    ...publicados.map((p) => `/noticias/${p.slug}/`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rotas.map((r) => `<url><loc>${DOMINIO}${r}</loc></url>`).join('\n')}
</urlset>`;
}

function escrever(rota, html) {
  const dir = path.join(PUBLIC_DIR, rota);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

/**
 * Gera o site completo em noticias/public a partir do banco.
 * @param {object} [banco] estado do banco (carregado do disco se omitido)
 */
function buildSite(banco) {
  banco = banco || db.carregar();
  const publicados = banco.posts
    .filter((p) => p.status === 'Publicar' && p.dataPublicacao)
    .sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao));

  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  escrever('', paginaInicial(publicados, banco.indicadores));
  escrever('noticias', listaPosts(publicados, {
    titulo: 'Notícias e análises',
    descricao: 'Todas as análises publicadas pelo boletim, da mais recente para a mais antiga.',
    rota: '/noticias/',
  }));

  for (const secao of SECOES.filter((s) => s.categorias)) {
    const filtrados = publicados.filter((p) => secao.categorias.includes(p.categoria));
    escrever(secao.rota.replace(/\//g, ''), listaPosts(filtrados, {
      titulo: secao.titulo,
      descricao: `Análises do boletim A&L sobre ${secao.titulo.toLowerCase()}.`,
      rota: secao.rota,
    }));
  }

  escrever('indicadores', layout({
    titulo: 'Indicadores',
    descricao: 'Selic, IPCA, IGP-M, INPC e expectativas do Boletim Focus, direto das APIs oficiais do Banco Central.',
    rota: '/indicadores/',
    corpo: `<h1>Indicadores acompanhados</h1><p class="sub">Dados primários coletados nas APIs oficiais do Banco Central do Brasil a cada rodada.</p>${tabelaIndicadores(banco.indicadores)}`,
  }));

  escrever('sobre', paginaSobre());
  escrever('politica-editorial', paginaPolitica());
  escrever('fontes', paginaFontes());

  for (const p of publicados) escrever(path.join('noticias', p.slug), paginaPost(p));

  fs.writeFileSync(path.join(PUBLIC_DIR, 'feed.xml'), feedRss(publicados));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap(publicados));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${DOMINIO}/sitemap.xml\n`);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'CNAME'), 'noticias.aelimoveis.com.br\n');

  console.log(`[site] ${publicados.length} post(s) publicados renderizados em ${PUBLIC_DIR}`);
  return { publicados: publicados.length };
}

if (require.main === module) buildSite();

module.exports = { buildSite, AVISO_EDITORIAL };
