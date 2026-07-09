'use strict';

// Busca estruturada sobre o inventário local. A IA chama isso via tool use —
// ela nunca "inventa" imóvel: só apresenta o que esta função retornar.
const store = require('./store');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function buscarImoveis(filtros = {}, inventario = null) {
  const { imoveis } = inventario || store.loadInventory();
  const f = {
    finalidade: norm(filtros.finalidade),
    tipo: norm(filtros.tipo),
    cidade: norm(filtros.cidade),
    bairro: norm(filtros.bairro),
    precoMin: Number(filtros.precoMin) || null,
    precoMax: Number(filtros.precoMax) || null,
    quartosMin: Number(filtros.quartosMin) || null,
    suitesMin: Number(filtros.suitesMin) || null,
    vagasMin: Number(filtros.vagasMin) || null,
    areaMin: Number(filtros.areaMin) || null,
    termo: norm(filtros.termo),
    limite: Math.min(Number(filtros.limite) || 6, 10),
  };

  let candidatos = imoveis.filter((i) => {
    const preco = i.finalidade === 'aluguel' ? i.precoLocacao : i.precoVenda;
    if (f.finalidade && norm(i.finalidade) !== f.finalidade) return false;
    if (f.tipo && !norm(i.tipo).includes(f.tipo)) return false;
    if (f.cidade && !norm(i.cidade).includes(f.cidade)) return false;
    if (f.precoMin && (!preco || preco < f.precoMin)) return false;
    if (f.precoMax && (!preco || preco > f.precoMax)) return false;
    if (f.quartosMin && (i.quartos || 0) < f.quartosMin) return false;
    if (f.suitesMin && (i.suites || 0) < f.suitesMin) return false;
    if (f.vagasMin && (i.vagas || 0) < f.vagasMin) return false;
    if (f.areaMin && (i.area || 0) < f.areaMin) return false;
    return true;
  });

  // Bairro e termo livre entram como ranking (não corte duro): se não houver
  // nada no bairro pedido, ainda mostramos os mais próximos do perfil.
  const score = (i) => {
    let s = 0;
    if (f.bairro) {
      if (norm(i.bairro).includes(f.bairro)) s += 100;
      else if (norm(i.descricao).includes(f.bairro) || norm(i.titulo).includes(f.bairro)) s += 40;
    }
    if (f.termo) {
      const alvo = `${norm(i.titulo)} ${norm(i.descricao)} ${norm(i.bairro)} ${norm(i.tipo)}`;
      for (const palavra of f.termo.split(/\s+/).filter((w) => w.length > 2)) {
        if (alvo.includes(palavra)) s += 10;
      }
    }
    if (i.fotos && i.fotos.length) s += 2; // com foto apresenta melhor
    return s;
  };

  candidatos = candidatos
    .map((i) => ({ i, s: score(i) }))
    .sort((a, b) => b.s - a.s)
    .map(({ i }) => i);

  const exatosNoBairro = f.bairro ? candidatos.filter((i) => norm(i.bairro).includes(f.bairro)).length : null;
  return {
    total: candidatos.length,
    exatosNoBairro,
    imoveis: candidatos.slice(0, f.limite),
  };
}

// Versão compacta para mandar à IA (economia de tokens: sem descrição longa nem todas as fotos).
function resumoParaIA(imovel) {
  const preco = imovel.finalidade === 'aluguel' ? imovel.precoLocacao : imovel.precoVenda;
  return {
    id: imovel.id,
    finalidade: imovel.finalidade,
    tipo: imovel.tipo,
    titulo: imovel.titulo,
    bairro: imovel.bairro,
    cidade: imovel.cidade,
    preco,
    quartos: imovel.quartos,
    suites: imovel.suites,
    vagas: imovel.vagas,
    area: imovel.area,
    resumo: (imovel.descricao || '').slice(0, 200),
  };
}

module.exports = { buscarImoveis, resumoParaIA };
