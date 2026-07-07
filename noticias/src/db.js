// Banco de dados do boletim: arquivo JSON versionável (data/db.json).
//
// Estrutura:
// {
//   posts:      [ver esquema em criarPost()],
//   arquivadas: [registros internos de notícias não publicadas],
//   indicadores:{ atualizadoEm, itens: [{id, nome, valor, data}], focus: [...] },
//   rodadas:    [{data, rodada, status, postsGerados, alertas}]
// }

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function carregar() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return { posts: [], arquivadas: [], indicadores: null, rodadas: [] };
  }
}

function salvar(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let seq = 0;
function novoId(prefixo) {
  seq += 1;
  return `${prefixo}_${Date.now().toString(36)}${seq.toString(36)}`;
}

// Esquema completo de um post, conforme a especificação editorial.
function criarPost(campos) {
  return {
    id: novoId('post'),
    dataColeta: new Date().toISOString(),
    dataPublicacao: null,
    rodada: null, // "manha" | "noite"
    fonteOriginal: null,
    urlOriginal: null,
    tituloOriginal: null,
    tituloEditorial: null,
    categoria: null,
    tags: [],
    resumoBruto: null,
    analiseAgente2: null,
    textoFinal: null,
    leituraAEL: null,
    fontes: [],
    metaDescription: null,
    slug: null,
    scoreRelevancia: null,
    grauConfianca: null, // "alto" | "medio" | "baixo"
    status: null, // "Publicar" | "Revisar" | "Rascunho" | "Não publicar"
    historico: [],
    ...campos,
  };
}

function registrarAlteracao(post, acao, detalhe = '') {
  post.historico.push({ ts: new Date().toISOString(), acao, detalhe });
}

// Evita repetir a mesma notícia entre rodadas: URLs já usadas em posts ou arquivadas.
function urlsConhecidas(db) {
  const set = new Set();
  for (const p of db.posts) if (p.urlOriginal) set.add(p.urlOriginal);
  for (const a of db.arquivadas) if (a.url) set.add(a.url);
  return set;
}

module.exports = { carregar, salvar, criarPost, registrarAlteracao, urlsConhecidas, novoId, DB_PATH };
