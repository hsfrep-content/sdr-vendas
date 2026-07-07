// Cliente HTTP com timeout e retry para coleta de feeds e APIs públicas.

const UA =
  'AELNoticiasBot/1.0 (+https://noticias.aelimoveis.com.br/sobre; boletim editorial; coleta de RSS/APIs publicas)';

async function fetchTexto(url, { timeoutMs = 20000, tentativas = 3 } = {}) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: '*/*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await res.text();
    } catch (e) {
      erro = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw erro;
}

async function fetchJson(url, opts) {
  const txt = await fetchTexto(url, opts);
  return JSON.parse(txt);
}

module.exports = { fetchTexto, fetchJson };
