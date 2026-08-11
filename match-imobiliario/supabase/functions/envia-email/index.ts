// =====================================================================
//  MATCH IMOBILIÁRIO by A&L — T2: Edge Function de notificação
//  Recebe eventos dos gatilhos do banco (t2-notificacoes.sql) e envia
//  e-mail via Resend a partir de contato@aelimoveis.com.br.
//
//  Deploy:  supabase functions deploy envia-email --no-verify-jwt
//  Secrets: supabase secrets set RESEND_API_KEY=... SEGREDO_NOTIFICACOES=...
// =====================================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SEGREDO = Deno.env.get('SEGREDO_NOTIFICACOES') ?? '';
const URL_APP = Deno.env.get('URL_APP') ?? 'https://parcerias.aelimoveis.com.br';
const REMETENTE = 'Match Imobiliário by A&L <contato@aelimoveis.com.br>';

type Destinatario = { email: string; nome: string };
type Evento = {
  evento: string;
  destinatarios: Destinatario[];
  dados: Record<string, unknown>;
};

const TIPOS: Record<string, string> = {
  apartamento: 'Apartamento', casa: 'Casa', casa_condominio: 'Casa em condomínio',
  cobertura: 'Cobertura', flat: 'Flat', terreno: 'Terreno', sala: 'Sala comercial',
  loja: 'Loja', galpao: 'Galpão', outro: 'Imóvel',
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function resumoImovel(d: Record<string, unknown>): string {
  const tipo = TIPOS[String(d.imovel_tipo)] ?? 'Imóvel';
  return `${tipo} em ${esc(d.imovel_bairro)}, ${esc(d.imovel_cidade)}`;
}

// Template base — identidade A&L (areia, naval, dourado), estilos inline
// porque cliente de e-mail não carrega CSS externo.
function moldura(titulo: string, corpo: string, cta?: { rotulo: string; url: string }): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#EFE9DC;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="text-align:center;padding-bottom:22px">
    <span style="display:inline-block;background:linear-gradient(135deg,#D6A93B,#A87F1E);color:#0E1114;font-weight:bold;font-size:18px;width:40px;height:40px;line-height:40px;border-radius:11px">A&amp;L</span>
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7E848C;padding-top:8px;font-family:Arial,Helvetica,sans-serif">Match Imobiliário</div>
  </div>
  <div style="background:#FFFFFF;border-radius:20px;padding:34px 30px;border:1px solid #E2E5E8">
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.15;color:#0E1114;font-weight:600">${titulo}</h1>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2C425C">${corpo}</div>
    ${cta ? `<div style="padding-top:24px"><a href="${esc(cta.url)}" style="display:inline-block;background:#D6A93B;color:#0E1114;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 28px;border-radius:999px">${esc(cta.rotulo)}</a></div>` : ''}
  </div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7E848C;text-align:center;padding-top:22px">
    A&amp;L Negócios Imobiliários · CRECI/PE 17.931-F<br>
    <a href="mailto:contato@aelimoveis.com.br" style="color:#7E848C">contato@aelimoveis.com.br</a> ·
    <a href="${esc(URL_APP)}" style="color:#7E848C">parcerias.aelimoveis.com.br</a><br>
    Você recebe este aviso porque tem cadastro ativo na plataforma.
  </div>
</div>
</body></html>`;
}

function montaEmail(ev: Evento, dest: Destinatario): { assunto: string; html: string } | null {
  const d = ev.dados;
  const nome = esc((dest.nome || '').split(' ')[0]);
  const linkTermo = { rotulo: 'Ler e assinar o termo', url: `${URL_APP}/#/termo/${d.termo_id}` };
  const linkPainel = { rotulo: 'Abrir meu painel', url: `${URL_APP}/#/painel` };

  switch (ev.evento) {
    case 'match_encontrado':
      return {
        assunto: 'Match encontrado — assine o Termo de Parceria',
        html: moldura('Encontramos o outro lado da sua operação.',
          `<p>Olá, ${nome}.</p>
           <p>Nossa curadoria cruzou <strong>${resumoImovel(d)}</strong> com a demanda <strong>${esc(d.demanda_codigo ?? 'registrada')}</strong> e aprovou o match.</p>
           <p>O contato do outro corretor é liberado assim que <strong>os dois assinarem o Termo de Parceria</strong> — leva menos de dois minutos.</p>`,
          linkTermo),
      };
    case 'assinatura_parcial':
      return {
        assunto: 'Falta só a sua assinatura no Termo de Parceria',
        html: moldura('O outro corretor já assinou.',
          `<p>Olá, ${nome}.</p>
           <p>O termo da operação <strong>${resumoImovel(d)}</strong> ↔ <strong>${esc(d.demanda_codigo ?? 'demanda')}</strong> já tem a assinatura do outro lado.</p>
           <p>Assim que você assinar, o contato é liberado para os dois na mesma hora.</p>`,
          linkTermo),
      };
    case 'conexao_realizada':
      return {
        assunto: 'Conexão realizada — contato liberado',
        html: moldura('As duas partes assinaram. Bom negócio.',
          `<p>Olá, ${nome}.</p>
           <p>O Termo de Parceria da operação <strong>${resumoImovel(d)}</strong> ↔ <strong>${esc(d.demanda_codigo ?? 'demanda')}</strong> foi assinado pelas duas partes.</p>
           <p>O contato do seu parceiro já está disponível na tela do termo. A partir daqui, a operação segue entre vocês — e a A&amp;L fica à disposição.</p>`,
          linkTermo),
      };
    case 'creci_verificado':
      return {
        assunto: 'Seu CRECI foi verificado',
        html: moldura('Cadastro verificado. Você está na base.',
          `<p>Olá, ${nome}.</p>
           <p>Conferimos seu registro e seu cadastro está <strong>ativo</strong>. Seus imóveis e demandas já entram na fila de cruzamento.</p>`,
          linkPainel),
      };
    case 'creci_recusado':
      return {
        assunto: 'Não foi possível verificar seu CRECI',
        html: moldura('Precisamos falar sobre seu cadastro.',
          `<p>Olá, ${nome}.</p>
           <p>Não conseguimos validar o CRECI informado no seu cadastro. Confira o número e a UF no seu perfil ou responda este e-mail que a nossa equipe ajuda a resolver.</p>`,
          { rotulo: 'Revisar meu perfil', url: `${URL_APP}/#/perfil` }),
      };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });
  if (!SEGREDO || req.headers.get('x-segredo') !== SEGREDO) {
    return new Response('Não autorizado', { status: 401 });
  }

  let ev: Evento;
  try { ev = await req.json(); } catch { return new Response('JSON inválido', { status: 400 }); }
  if (!ev?.evento || !Array.isArray(ev.destinatarios)) {
    return new Response('Payload incompleto', { status: 400 });
  }

  const resultados: Record<string, string> = {};
  for (const dest of ev.destinatarios) {
    if (!dest?.email) continue;
    const email = montaEmail(ev, dest);
    if (!email) { resultados[dest.email] = 'evento desconhecido'; continue; }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: REMETENTE,
        to: [dest.email],
        subject: email.assunto,
        html: email.html,
      }),
    });
    resultados[dest.email] = resp.ok ? 'enviado' : `falha ${resp.status}: ${await resp.text()}`;
  }

  console.log(ev.evento, resultados);
  return new Response(JSON.stringify({ ok: true, resultados }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
