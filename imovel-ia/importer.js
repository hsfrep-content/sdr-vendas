'use strict';

// Importador do estoque de imóveis.
//
// Estratégias (nesta ordem de preferência):
//   A) Feed XML do Tecimob (formatos VivaReal/ZAP "Carga" e VRSync "ListingDataFeed")
//      → painel do Tecimob: Integrações/Portais → gerar URL do feed.
//   B) Crawler do próprio site (sitemap.xml → páginas de imóvel com JSON-LD/OpenGraph).
//   C) Inventário de exemplo (--exemplo) para testar toda a experiência antes do feed real.
//
// Uso:
//   node imovel-ia/importer.js <url-do-feed.xml | arquivo.xml>
//   node imovel-ia/importer.js --site https://imoveis.suaimobiliaria.com.br
//   node imovel-ia/importer.js --exemplo

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');
const store = require('./store');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true });

function toArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function num(x) {
  if (x === undefined || x === null || x === '') return null;
  const n = Number(String(x).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function texto(x) {
  if (x === undefined || x === null) return '';
  return String(typeof x === 'object' ? x['#text'] ?? '' : x).trim();
}

// ---------- Formato "Carga" (VivaReal/ZAP legado — usado pelo Tecimob) ----------
function parseCarga(doc) {
  const imoveis = toArray(doc?.Carga?.Imoveis?.Imovel);
  return imoveis.map((i) => {
    const fotos = toArray(i?.Fotos?.Foto)
      .map((f) => texto(f?.URLArquivo || f?.NomeArquivo))
      .filter((u) => /^https?:\/\//.test(u));
    const precoVenda = num(i.PrecoVenda);
    const precoLocacao = num(i.PrecoLocacao);
    return {
      id: texto(i.CodigoImovel) || texto(i.CodigoCliente),
      finalidade: precoLocacao && !precoVenda ? 'aluguel' : 'venda',
      precoVenda,
      precoLocacao,
      tipo: texto(i.SubTipoImovel) || texto(i.TipoImovel),
      titulo: texto(i.TituloImovel) || `${texto(i.TipoImovel)} em ${texto(i.Bairro)}`,
      descricao: texto(i.Observacao),
      bairro: texto(i.Bairro),
      cidade: texto(i.Cidade),
      uf: texto(i.UF) || texto(i.Estado),
      quartos: num(i.QtdDormitorios),
      suites: num(i.QtdSuites),
      banheiros: num(i.QtdBanheiros),
      vagas: num(i.QtdVagas),
      area: num(i.AreaUtil) || num(i.AreaTotal),
      condominio: num(i.PrecoCondominio),
      url: texto(i.URLImovel) || texto(i.LinkImovel) || '',
      fotos,
    };
  });
}

// ---------- Formato VRSync (VivaReal/ZAP unificado: ListingDataFeed) ----------
function parseListingDataFeed(doc) {
  const listings = toArray(doc?.ListingDataFeed?.Listings?.Listing);
  return listings.map((l) => {
    const det = l.Details || {};
    const loc = l.Location || {};
    const fotos = toArray(l?.Media?.Item)
      .map((m) => texto(m))
      .filter((u) => /^https?:\/\//.test(u));
    const transacao = texto(l.TransactionType).toLowerCase();
    const precoVenda = num(det.ListPrice);
    const precoLocacao = num(det.RentalPrice);
    return {
      id: texto(l.ListingID),
      finalidade: transacao.includes('rent') && !transacao.includes('sale') ? 'aluguel' : (precoLocacao && !precoVenda ? 'aluguel' : 'venda'),
      precoVenda,
      precoLocacao,
      tipo: texto(det.PropertyType).split('/').pop() || texto(det.PropertyType),
      titulo: texto(l.Title) || `${texto(det.PropertyType)} em ${texto(loc.Neighborhood)}`,
      descricao: texto(det.Description),
      bairro: texto(loc.Neighborhood),
      cidade: texto(loc.City),
      uf: texto(loc.State?.['@_abbreviation']) || texto(loc.State),
      quartos: num(det.Bedrooms),
      suites: num(det.Suites),
      banheiros: num(det.Bathrooms),
      vagas: num(det.Garage),
      area: num(det.LivingArea) || num(det.LotArea),
      condominio: num(det.PropertyAdministrationFee),
      url: texto(l.DetailViewUrl),
      fotos,
    };
  });
}

function parseFeedXml(xml) {
  const doc = parser.parse(xml);
  let imoveis = [];
  if (doc?.Carga) imoveis = parseCarga(doc);
  else if (doc?.ListingDataFeed) imoveis = parseListingDataFeed(doc);
  else throw new Error('Formato de feed não reconhecido (esperado <Carga> ou <ListingDataFeed>).');
  return imoveis.filter((i) => i.id);
}

// ---------- Crawler do site (fallback) ----------
async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AeLImoveisBot/1.0; importador do proprio site)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.text();
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
}

async function crawlSite(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  let urls = [];
  try {
    const sitemap = await fetchText(`${base}/sitemap.xml`);
    urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
      .filter((u) => /imovel|imoveis\/|propriedade|detalhe/i.test(u));
  } catch {
    // sem sitemap: tenta a home e coleta links que pareçam de imóvel
    const home = await fetchText(base);
    urls = [...home.matchAll(/href=["']([^"']*imovel[^"']*)["']/gi)]
      .map((m) => new URL(m[1], base).href);
  }
  urls = [...new Set(urls)].slice(0, 500);
  console.log(`Crawler: ${urls.length} páginas de imóvel encontradas.`);

  const imoveis = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const ld = extractJsonLd(html).flatMap((x) => (Array.isArray(x) ? x : [x]))
        .find((x) => /Product|Offer|Residence|Apartment|House|RealEstateListing|Place/i.test(String(x['@type'])));
      const og = (prop) => (html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)`, 'i')) || [])[1];
      const titulo = ld?.name || og('title') || '';
      const preco = num(ld?.offers?.price) || num((html.match(/R\$\s*([\d.,]+)/) || [])[1]);
      imoveis.push({
        id: url.split('/').filter(Boolean).pop(),
        finalidade: /alug/i.test(url + titulo) ? 'aluguel' : 'venda',
        precoVenda: /alug/i.test(url + titulo) ? null : preco,
        precoLocacao: /alug/i.test(url + titulo) ? preco : null,
        tipo: (titulo.match(/apartamento|casa|terreno|sala|sobrado|cobertura|kitnet|galp[aã]o/i) || ['Imóvel'])[0],
        titulo,
        descricao: ld?.description || og('description') || '',
        bairro: '', cidade: '', uf: '',
        quartos: num((html.match(/(\d+)\s*(?:quartos?|dormit[óo]rios?)/i) || [])[1]),
        suites: num((html.match(/(\d+)\s*su[íi]tes?/i) || [])[1]),
        banheiros: num((html.match(/(\d+)\s*banheiros?/i) || [])[1]),
        vagas: num((html.match(/(\d+)\s*vagas?/i) || [])[1]),
        area: num((html.match(/([\d.,]+)\s*m²/i) || [])[1]),
        condominio: null,
        url,
        fotos: [og('image')].filter(Boolean),
      });
      await new Promise((r) => setTimeout(r, 300)); // educado com o próprio servidor
    } catch (err) {
      console.warn(`  aviso: falha em ${url}: ${err.message}`);
    }
  }
  return imoveis.filter((i) => i.titulo);
}

// ---------- Inventário de exemplo (para testar sem o feed real) ----------
const EXEMPLO = [
  { id: 'AP101', finalidade: 'venda', precoVenda: 439000, precoLocacao: null, tipo: 'Apartamento', titulo: 'Apartamento 3 dorm. com piscina no Jardim das Flores', descricao: 'Apartamento com 3 dormitórios, sacada com churrasqueira, condomínio com piscina e salão de festas. Próximo a escolas e supermercado.', bairro: 'Jardim das Flores', cidade: 'Itajaí', uf: 'SC', quartos: 3, suites: 0, banheiros: 2, vagas: 1, area: 68, condominio: 350, url: 'https://imoveis.aelimoveis.com.br/imovel/AP101', fotos: [] },
  { id: 'AP102', finalidade: 'venda', precoVenda: 415000, precoLocacao: null, tipo: 'Apartamento', titulo: 'Apartamento 3 dorm. 75m² no Jardim das Flores', descricao: 'Living ampliado, cozinha planejada, 1 vaga. Aceita financiamento e FGTS.', bairro: 'Jardim das Flores', cidade: 'Itajaí', uf: 'SC', quartos: 3, suites: 0, banheiros: 2, vagas: 1, area: 75, condominio: 280, url: 'https://imoveis.aelimoveis.com.br/imovel/AP102', fotos: [] },
  { id: 'AP103', finalidade: 'venda', precoVenda: 450000, precoLocacao: null, tipo: 'Apartamento', titulo: 'Apartamento 2 dorm. com 2 vagas no Centro', descricao: 'Apartamento de 65m² com 2 vagas de garagem, andar alto, vista livre.', bairro: 'Centro', cidade: 'Itajaí', uf: 'SC', quartos: 2, suites: 0, banheiros: 1, vagas: 2, area: 65, condominio: 420, url: 'https://imoveis.aelimoveis.com.br/imovel/AP103', fotos: [] },
  { id: 'AP201', finalidade: 'venda', precoVenda: 285000, precoLocacao: null, tipo: 'Apartamento', titulo: 'Apartamento 2 dorm. econômico — use seu FGTS', descricao: 'Ideal para sair do aluguel: 2 dormitórios, 48m², playground e portaria. Renda familiar a partir de R$ 6 mil aprova financiamento.', bairro: 'São Vicente', cidade: 'Itajaí', uf: 'SC', quartos: 2, suites: 0, banheiros: 1, vagas: 1, area: 48, condominio: 220, url: 'https://imoveis.aelimoveis.com.br/imovel/AP201', fotos: [] },
  { id: 'CA301', finalidade: 'venda', precoVenda: 1250000, precoLocacao: null, tipo: 'Casa', titulo: 'Casa alto padrão 3 suítes na Praia Brava', descricao: 'Casa com 3 suítes, piscina privativa, 240m², a 400m do mar. Condomínio fechado com segurança 24h.', bairro: 'Praia Brava', cidade: 'Itajaí', uf: 'SC', quartos: 3, suites: 3, banheiros: 4, vagas: 2, area: 240, condominio: 900, url: 'https://imoveis.aelimoveis.com.br/imovel/CA301', fotos: [] },
  { id: 'AP401', finalidade: 'aluguel', precoVenda: null, precoLocacao: 2300, tipo: 'Apartamento', titulo: 'Apartamento 2 dorm. mobiliado para alugar no Centro', descricao: 'Mobiliado e decorado, pronto para morar. Condomínio com academia.', bairro: 'Centro', cidade: 'Itajaí', uf: 'SC', quartos: 2, suites: 1, banheiros: 2, vagas: 1, area: 70, condominio: 480, url: 'https://imoveis.aelimoveis.com.br/imovel/AP401', fotos: [] },
  { id: 'CA402', finalidade: 'aluguel', precoVenda: null, precoLocacao: 3800, tipo: 'Casa', titulo: 'Casa 3 dorm. com quintal para alugar no bairro Fazenda', descricao: 'Casa ampla com quintal, área gourmet e 2 vagas. Aceita pet.', bairro: 'Fazenda', cidade: 'Itajaí', uf: 'SC', quartos: 3, suites: 1, banheiros: 3, vagas: 2, area: 160, condominio: null, url: 'https://imoveis.aelimoveis.com.br/imovel/CA402', fotos: [] },
  { id: 'AP501', finalidade: 'venda', precoVenda: 890000, precoLocacao: null, tipo: 'Apartamento', titulo: 'Apartamento frente mar 3 suítes em Balneário Camboriú', descricao: 'Vista definitiva para o mar, 3 suítes, 2 vagas, lazer completo com piscina térmica.', bairro: 'Barra Sul', cidade: 'Balneário Camboriú', uf: 'SC', quartos: 3, suites: 3, banheiros: 4, vagas: 2, area: 130, condominio: 1100, url: 'https://imoveis.aelimoveis.com.br/imovel/AP501', fotos: [] },
];

// ---------- Execução ----------
async function importar(fonte) {
  let imoveis;
  let origem;

  if (fonte === '--exemplo') {
    imoveis = EXEMPLO;
    origem = 'exemplo';
  } else if (fonte === '--site') {
    const site = process.argv[3];
    if (!site) throw new Error('Informe a URL do site: node imovel-ia/importer.js --site https://imoveis...');
    imoveis = await crawlSite(site);
    origem = `crawler:${site}`;
  } else if (/^https?:\/\//.test(fonte)) {
    const xml = await fetchText(fonte);
    imoveis = parseFeedXml(xml);
    origem = `feed:${fonte}`;
  } else if (fs.existsSync(fonte)) {
    imoveis = parseFeedXml(fs.readFileSync(fonte, 'utf8'));
    origem = `arquivo:${fonte}`;
  } else {
    throw new Error(`Fonte não reconhecida: ${fonte}`);
  }

  const data = store.saveInventory(imoveis, origem);
  return data;
}

if (require.main === module) {
  const fonte = process.argv[2];
  if (!fonte) {
    console.log('Uso:\n  node imovel-ia/importer.js <url-ou-arquivo-do-feed.xml>\n  node imovel-ia/importer.js --site <url-do-site>\n  node imovel-ia/importer.js --exemplo');
    process.exit(1);
  }
  importar(fonte)
    .then((data) => console.log(`OK: ${data.imoveis.length} imóveis importados (origem: ${data.origem}).`))
    .catch((err) => { console.error(`Erro: ${err.message}`); process.exit(1); });
}

module.exports = { parseFeedXml, crawlSite, importar, EXEMPLO };
