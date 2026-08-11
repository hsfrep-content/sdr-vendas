// =====================================================================
//  MATCH IMOBILIÁRIO by A&L — T3: registro de IP em aceites e assinaturas
//  O navegador não enxerga o próprio IP; esta função intermedia a
//  gravação e captura o IP real da requisição, dando valor probatório
//  ao aceite e à assinatura do termo.
//
//  Deploy:  supabase functions deploy registra-aceite
//  (JWT verificado no gateway: só usuário logado chama.)
//  Secrets: nenhum manual — SUPABASE_URL, SUPABASE_ANON_KEY e
//           SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function ipDaRequisicao(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
}

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido' });

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao.startsWith('Bearer ')) return resposta(401, { erro: 'Sessão ausente' });

  // 1. Identifica o usuário pelo token da sessão (e-mail verificado pelo Google).
  const rUser = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: autorizacao },
  });
  if (!rUser.ok) return resposta(401, { erro: 'Sessão inválida ou expirada' });
  const usuario = await rUser.json();

  // 2. Corretor correspondente.
  const rCorretor = await fetch(
    `${SUPABASE_URL}/rest/v1/corretores?user_id=eq.${usuario.id}&select=id`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const corretores = rCorretor.ok ? await rCorretor.json() : [];
  if (!corretores.length) return resposta(404, { erro: 'Cadastro de corretor não encontrado' });
  const corretorId: string = corretores[0].id;

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return resposta(400, { erro: 'JSON inválido' }); }

  const ip = ipDaRequisicao(req);

  // 3a. Aceite de disclaimer/termo de uso, com IP.
  if (corpo.acao === 'aceite') {
    if (!corpo.tipo_termo) return resposta(400, { erro: 'tipo_termo obrigatório' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/aceites`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        corretor_id: corretorId,
        tipo_termo: String(corpo.tipo_termo).slice(0, 60),
        versao_termo: String(corpo.versao_termo ?? 'v1').slice(0, 20),
        ip,
      }),
    });
    if (!r.ok) return resposta(500, { erro: 'Falha ao registrar aceite: ' + await r.text() });
    return resposta(200, { ok: true, ip });
  }

  // 3b. Assinatura do Termo de Parceria: valida pela RPC (com as regras
  //     todas do banco, no contexto do usuário) e complementa com o IP,
  //     que só esta função consegue gravar.
  if (corpo.acao === 'assinatura') {
    if (!corpo.termo_id || !corpo.hash) return resposta(400, { erro: 'termo_id e hash obrigatórios' });
    const rAss = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assinar_termo`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY, Authorization: autorizacao,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_termo_id: corpo.termo_id,
        p_hash: corpo.hash,
        p_user_agent: String(corpo.user_agent ?? req.headers.get('user-agent') ?? '').slice(0, 400),
      }),
    });
    if (!rAss.ok) {
      const detalhe = await rAss.json().catch(() => ({}));
      return resposta(rAss.status, { erro: detalhe.message ?? 'Falha ao assinar' });
    }
    const rIp = await fetch(
      `${SUPABASE_URL}/rest/v1/termo_assinaturas?termo_id=eq.${corpo.termo_id}&corretor_id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ ip }),
      },
    );
    return resposta(200, { ok: true, ip, ip_gravado: rIp.ok });
  }

  return resposta(400, { erro: 'Ação desconhecida' });
});
