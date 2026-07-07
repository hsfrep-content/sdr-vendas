// Orquestração de uma rodada completa:
//   Agente 1 (coleta) -> Agente 2 (análise) -> Agente 3 (edição/publicação)
//   -> banco de dados -> relatórios (JSON + Markdown) -> build do site.
//
// Saídas por rodada (em relatorios/):
//   AAAA-MM-DD-rodada.json  relatório interno completo
//   AAAA-MM-DD-rodada.md    relatório editorial em Markdown

const fs = require('fs');
const path = require('path');
const { coletar, coletarIndicadores } = require('./agents/agente1-coletor');
const { analisar } = require('./agents/agente2-analista');
const { editar } = require('./agents/agente3-editor');
const db = require('./db');
const { log } = require('./lib/logger');
const { dataISOBrasilia, formatarDataHoraBR, rodadaPadrao } = require('./lib/texto');
const { buildSite } = require('./site/build');

const RELATORIOS_DIR = path.join(__dirname, '..', 'relatorios');

function gerarAlertas(ranqueadas, parecer) {
  const alertas = [];
  const gatilhos = [
    { re: /copom|selic/i, msg: 'Movimento envolvendo Copom/Selic no radar.' },
    { re: /ipca|inflacao|inflação/i, msg: 'Nova leitura de inflação no período.' },
    { re: /minha casa|mcmv/i, msg: 'Possível mudança em regras do MCMV.' },
    { re: /caixa econ|financiamento habitacional|crédito imobiliário|credito imobiliario/i, msg: 'Movimento em crédito/financiamento habitacional.' },
    { re: /fipezap/i, msg: 'Novos dados FipeZAP disponíveis.' },
  ];
  const textos = ranqueadas.map((n) => `${n.titulo} ${n.resumo}`).join(' | ');
  for (const g of gatilhos) if (g.re.test(textos)) alertas.push(g.msg);
  for (const t of parecer.temas || []) {
    if (t.recomendacao === 'aguardar') alertas.push(`Aguardando confirmação por fonte primária: ${t.titulo}`);
  }
  return alertas;
}

function relatorioMarkdown(rel) {
  const linhas = [
    `# Relatório editorial — ${rel.data} (rodada da ${rel.rodada === 'manha' ? 'manhã' : 'noite'})`,
    '',
    `Gerado em ${formatarDataHoraBR(new Date())} (Brasília). Status final: **${rel.status_final}**.`,
    '',
    '## Parecer do Analista (Agente 2)',
    rel.parecer.observacoesGerais || '—',
    '',
  ];
  (rel.parecer.temas || []).forEach((t, i) => {
    linhas.push(
      `### Tema ${i + 1}: ${t.titulo}`,
      `- **O que aconteceu:** ${t.oQueAconteceu}`,
      `- **Por que importa:** ${t.porQueImporta}`,
      `- **Impacto financeiro:** ${t.impactoFinanceiro}`,
      `- **Impacto imobiliário:** ${t.impactoImobiliario}`,
      `- **Impacto regional:** ${t.impactoRegional}`,
      `- **Fonte primária confirmada:** ${t.confirmadoPorFontePrimaria ? 'sim' : 'não'}`,
      `- **Grau de confiança:** ${t.grauConfianca} · **Recomendação:** ${t.recomendacao}`,
      ''
    );
  });
  linhas.push('## Posts gerados (Agente 3)', '');
  if (rel.posts_gerados.length === 0) linhas.push('_Nenhum post nesta rodada (registro interno apenas)._', '');
  for (const p of rel.posts_gerados) {
    linhas.push(
      `### [${p.status}] ${p.tituloEditorial}`,
      `Categoria: ${p.categoria} · Score: ${p.scoreRelevancia} · Confiança: ${p.grauConfianca}`,
      '',
      p.textoFinal,
      '',
      `**Leitura A&L:** ${p.leituraAEL}`,
      '',
      `Fontes: ${p.fontes.join(', ')} · Slug: \`${p.slug}\``,
      ''
    );
  }
  linhas.push('## Alertas', '');
  for (const a of rel.alertas) linhas.push(`- ${a}`);
  if (rel.alertas.length === 0) linhas.push('_Sem alertas._');
  linhas.push('', '## Descartadas (motivo)', '');
  for (const d of rel.noticias_descartadas.slice(0, 20)) {
    linhas.push(`- ${d.titulo} (${d.fonte}, nota ${d.nota}) — ${d.motivo}`);
  }
  return linhas.join('\n');
}

/**
 * Executa uma rodada completa.
 * @param {"manha"|"noite"} [rodada]
 */
async function executarRodada(rodada) {
  rodada = rodada || rodadaPadrao();
  const data = dataISOBrasilia();
  const autoPublish = String(process.env.AEL_AUTO_PUBLISH ?? 'true') !== 'false';
  const maxPosts = Math.min(3, Math.max(1, Number(process.env.AEL_MAX_POSTS || 3)));
  const janelaHoras = Number(process.env.AEL_JANELA_HORAS || (rodada === 'manha' ? 12 : 16));

  log('rodada.inicio', { msg: `${data} ${rodada}` });
  const banco = db.carregar();

  // ── Agente 1: coleta + indicadores oficiais ──────────────────────────────
  const { ranqueadas, todas, descartadas, fontesConsultadas } = await coletar({
    janelaHoras,
    urlsExcluidas: db.urlsConhecidas(banco),
  });
  const indicadores = await coletarIndicadores();
  if (indicadores.itens.length > 0 || !banco.indicadores) banco.indicadores = indicadores;

  // ── Agente 2: parecer editorial ──────────────────────────────────────────
  const parecer = await analisar(ranqueadas, { rodada, data });

  // ── Agente 3: edição, compliance e status ────────────────────────────────
  const posts = await editar(parecer, ranqueadas, { rodada, data, autoPublish, maxPosts });

  // ── Persistência ─────────────────────────────────────────────────────────
  for (const p of posts) banco.posts.push(p);
  for (const t of (parecer.temas || []).filter((x) => x.recomendacao !== 'publicar')) {
    banco.arquivadas.push({
      id: db.novoId('arq'),
      data,
      rodada,
      titulo: t.titulo,
      url: (t.urlsBase && t.urlsBase[0]) || null,
      motivo: t.recomendacao === 'aguardar' ? 'aguardando confirmação por fonte primária' : 'descartado pelo analista',
      analise: t,
    });
  }

  const alertas = gerarAlertas(ranqueadas, parecer);
  const publicados = posts.filter((p) => p.status === 'Publicar').length;
  const statusFinal =
    publicados > 0 ? 'publicado' : posts.length > 0 ? 'aguardando_revisao' : 'registro_interno';

  banco.rodadas.push({ data, rodada, status: statusFinal, postsGerados: posts.map((p) => p.id), alertas });
  db.salvar(banco);

  // ── Relatórios ───────────────────────────────────────────────────────────
  const relatorio = {
    data,
    rodada,
    fontes_consultadas: fontesConsultadas,
    noticias_coletadas: todas.map((n) => ({ titulo: n.titulo, fonte: n.fonte, url: n.link, nota: n.nota })),
    noticias_relevantes: ranqueadas,
    temas_publicaveis: (parecer.temas || []).filter((t) => t.recomendacao === 'publicar').map((t) => t.titulo),
    parecer,
    posts_gerados: posts,
    noticias_descartadas: descartadas,
    alertas,
    status_final: statusFinal,
  };
  fs.mkdirSync(RELATORIOS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RELATORIOS_DIR, `${data}-${rodada}.json`),
    JSON.stringify(relatorio, null, 2)
  );
  fs.writeFileSync(path.join(RELATORIOS_DIR, `${data}-${rodada}.md`), relatorioMarkdown(relatorio));

  // ── Build do site estático ───────────────────────────────────────────────
  buildSite(banco);

  log('rodada.fim', {
    msg: `status=${statusFinal} posts=${posts.length} publicados=${publicados} alertas=${alertas.length}`,
  });
  return relatorio;
}

module.exports = { executarRodada, gerarAlertas, relatorioMarkdown };
