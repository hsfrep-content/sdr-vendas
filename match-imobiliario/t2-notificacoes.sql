-- =====================================================================
--  MATCH IMOBILIÁRIO by A&L — T2: notificação por e-mail
--  Rode UMA VEZ em: painel Supabase → SQL Editor → New query → Run
--  Pré-requisitos: setup-supabase.sql e t1-termo-parceria.sql aplicados,
--  e a Edge Function envia-email publicada (ver T2-COMO-ATIVAR.md).
--
--  Depois de rodar, preencha a configuração no fim deste arquivo.
-- =====================================================================

create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. CONFIGURAÇÃO
--    Tabela de linha única com a URL da função e o segredo compartilhado.
--    RLS habilitado SEM políticas: invisível pela API; só os gatilhos
--    (security definer) leem.
-- ---------------------------------------------------------------------

create table if not exists config_notificacoes (
  id          boolean primary key default true check (id),
  url_funcao  text not null,
  segredo     text not null
);
alter table config_notificacoes enable row level security;

-- ---------------------------------------------------------------------
-- 2. DISPARADOR GENÉRICO
--    Chamada assíncrona via pg_net; falha de rede vira aviso no log,
--    nunca derruba a transação do usuário.
-- ---------------------------------------------------------------------

create or replace function notifica(p_evento text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg record;
begin
  select url_funcao, segredo into cfg from config_notificacoes limit 1;
  if cfg.url_funcao is null then return; end if;
  perform net.http_post(
    url     := cfg.url_funcao,
    headers := jsonb_build_object('Content-Type','application/json','x-segredo',cfg.segredo),
    body    := p_payload || jsonb_build_object('evento', p_evento)
  );
exception when others then
  raise warning 'notificação % não enviada: %', p_evento, sqlerrm;
end;
$$;

-- Monta o payload comum aos eventos de termo (partes + resumo da operação).
create or replace function payload_do_termo(p_termo_id uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'dados', jsonb_build_object(
      'termo_id',       t.id,
      'demanda_codigo', d.codigo,
      'imovel_tipo',    i.tipo,
      'imovel_bairro',  i.bairro,
      'imovel_cidade',  i.cidade),
    'captador',   jsonb_build_object('email', ci.email, 'nome', ci.nome, 'corretor_id', ci.id),
    'demandante', jsonb_build_object('email', cd.email, 'nome', cd.nome, 'corretor_id', cd.id)
  )
  from termos t
  join matches m     on m.id = t.match_id
  join imoveis i     on i.id = m.imovel_id
  join demandas d    on d.id = m.demanda_id
  join corretores ci on ci.id = i.corretor_id
  join corretores cd on cd.id = d.corretor_id
  where t.id = p_termo_id;
$$;

-- ---------------------------------------------------------------------
-- 3. GATILHOS
-- ---------------------------------------------------------------------

-- 3a. Termo criado (aprovação do match) → e-mail para as duas partes.
create or replace function notifica_termo_criado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
begin
  p := payload_do_termo(new.id);
  if p is null then return new; end if;
  perform notifica('match_encontrado', jsonb_build_object(
    'destinatarios', jsonb_build_array(p->'captador', p->'demandante'),
    'dados', p->'dados'));
  return new;
end;
$$;

drop trigger if exists tg_notifica_termo_criado on termos;
create trigger tg_notifica_termo_criado
  after insert on termos
  for each row execute function notifica_termo_criado();

-- 3b. Assinatura registrada.
--     1ª assinatura → avisa o corretor que ainda não assinou.
--     2ª assinatura → conexão realizada, avisa os dois.
--     Roda depois de tg_avalia_assinaturas (ordem alfabética), então o
--     status do termo já está atualizado.
create or replace function notifica_assinatura()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
  v_total int;
begin
  p := payload_do_termo(new.termo_id);
  if p is null then return new; end if;
  select count(*) into v_total from termo_assinaturas where termo_id = new.termo_id;

  if v_total >= 2 then
    perform notifica('conexao_realizada', jsonb_build_object(
      'destinatarios', jsonb_build_array(p->'captador', p->'demandante'),
      'dados', p->'dados'));
  else
    perform notifica('assinatura_parcial', jsonb_build_object(
      'destinatarios', jsonb_build_array(
        case when (p->'captador'->>'corretor_id')::uuid = new.corretor_id
             then p->'demandante' else p->'captador' end),
      'dados', p->'dados'));
  end if;
  return new;
end;
$$;

drop trigger if exists tg_notifica_assinatura on termo_assinaturas;
create trigger tg_notifica_assinatura
  after insert on termo_assinaturas
  for each row execute function notifica_assinatura();

-- 3c. CRECI verificado ou recusado → avisa o corretor.
create or replace function notifica_verificacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status_verificacao = 'pendente' and new.status_verificacao in ('verificado','recusado') then
    perform notifica(
      case when new.status_verificacao = 'verificado' then 'creci_verificado' else 'creci_recusado' end,
      jsonb_build_object(
        'destinatarios', jsonb_build_array(jsonb_build_object('email', new.email, 'nome', new.nome)),
        'dados', '{}'::jsonb));
  end if;
  return new;
end;
$$;

drop trigger if exists tg_notifica_verificacao on corretores;
create trigger tg_notifica_verificacao
  after update on corretores
  for each row execute function notifica_verificacao();

-- ---------------------------------------------------------------------
-- 4. PREENCHA E RODE — configuração do disparo
--    Troque SEU-PROJETO pela referência do projeto e o segredo pelo
--    MESMO valor gravado em SEGREDO_NOTIFICACOES na Edge Function.
-- ---------------------------------------------------------------------

-- insert into config_notificacoes (url_funcao, segredo)
-- values ('https://SEU-PROJETO.supabase.co/functions/v1/envia-email',
--         'TROQUE-POR-UM-SEGREDO-LONGO-E-ALEATORIO')
-- on conflict (id) do update
--   set url_funcao = excluded.url_funcao, segredo = excluded.segredo;

-- ---------------------------------------------------------------------
-- 5. CONFERÊNCIA
-- ---------------------------------------------------------------------

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('notifica','payload_do_termo','notifica_termo_criado',
                       'notifica_assinatura','notifica_verificacao')
order by routine_name;
