// Parser minimalista de RSS 2.0 / Atom, sem dependências externas.
// Extrai apenas os campos necessários ao Agente 1: título, link, data,
// descrição e autor. Nunca coleta o corpo integral da matéria.

function decodificarEntidades(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function removerHtml(s) {
  return decodificarEntidades(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extrairTag(bloco, tags) {
  for (const tag of tags) {
    const m = bloco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    if (m) return m[1];
  }
  return '';
}

function extrairLink(bloco) {
  const simples = extrairTag(bloco, ['link']);
  if (simples && /^\s*https?:/.test(decodificarEntidades(simples))) {
    return decodificarEntidades(simples);
  }
  // Atom: <link href="..."/>
  const m = bloco.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (m) return decodificarEntidades(m[1]);
  return '';
}

/**
 * @param {string} xml conteúdo bruto do feed
 * @returns {{titulo:string, link:string, data:Date|null, resumo:string, autor:string}[]}
 */
function parseFeed(xml) {
  const itens = [];
  const blocos = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const bloco of blocos) {
    const titulo = removerHtml(extrairTag(bloco, ['title']));
    const link = extrairLink(bloco);
    const dataRaw = decodificarEntidades(
      extrairTag(bloco, ['pubDate', 'published', 'updated', 'dc:date'])
    );
    const data = dataRaw ? new Date(dataRaw) : null;
    const resumo = removerHtml(
      extrairTag(bloco, ['description', 'summary', 'content'])
    ).slice(0, 600);
    const autor = removerHtml(extrairTag(bloco, ['dc:creator', 'author', 'creator'])).slice(0, 120);
    if (titulo && link) {
      itens.push({
        titulo,
        link,
        data: data && !isNaN(data) ? data : null,
        resumo,
        autor,
      });
    }
  }
  return itens;
}

module.exports = { parseFeed, removerHtml };
